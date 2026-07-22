/**
 * Stripe rails (Module 0 §4) — the payment primitives every module calls.
 * Server-only: import from '@ai/foundation/stripe' (NOT the package root,
 * which stays edge-safe).
 *
 * Owns: customer creation, payment-method vaulting, PAD (acss_debit) mandate
 * setup + agreement capture, charge/invoice primitives, webhook verification.
 * Does NOT own pricing math (Module 1) or payment-plan scheduling (Module 4) —
 * those call these rails with already-computed amounts.
 *
 * All amounts are integer CENTS, currency CAD unless stated otherwise.
 */

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/** Lazily-constructed shared client (account default API version). */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  _stripe = new Stripe(key);
  return _stripe;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CreateCustomerInput {
  email: string;
  name?: string;
  /** Always include clerk_user_id so a customer is traceable to its account. */
  metadata: { clerk_user_id: string } & Record<string, string>;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Stripe.Customer> {
  return getStripe().customers.create({
    email: input.email,
    name: input.name,
    metadata: input.metadata,
  });
}

/** Look up an existing customer by Clerk user id (metadata search). */
export async function findCustomerByClerkId(clerkUserId: string): Promise<Stripe.Customer | null> {
  const res = await getStripe().customers.search({
    query: `metadata['clerk_user_id']:'${clerkUserId}'`,
    limit: 1,
  });
  return res.data[0] ?? null;
}

// ---------------------------------------------------------------------------
// Payment-method vaulting (cards + PAD)
// ---------------------------------------------------------------------------

/**
 * PAD mandate terms captured with every acss_debit SetupIntent. `sporadic`
 * (amounts vary, no fixed schedule) fits registrations/rentals/payment plans.
 * Note: Stripe rejects `interval_description` for a sporadic schedule — it's
 * only valid with `interval`, so it's deliberately omitted here.
 */
export const PAD_MANDATE_OPTIONS: Stripe.SetupIntentCreateParams.PaymentMethodOptions.AcssDebit.MandateOptions =
  {
    payment_schedule: 'sporadic',
    transaction_type: 'personal',
  };

/** SetupIntent to vault a CARD for future off-session charges. */
export async function createCardSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
  return getStripe().setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
}

/**
 * SetupIntent to vault a Canadian bank account via PAD (acss_debit), capturing
 * the pre-authorized-debit AGREEMENT (mandate). Confirmed client-side with
 * Stripe.js `confirmAcssDebitSetup`, which renders the mandate agreement UI.
 */
export async function createPadSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
  return getStripe().setupIntents.create({
    customer: customerId,
    payment_method_types: ['acss_debit'],
    usage: 'off_session',
    payment_method_options: {
      acss_debit: {
        currency: 'cad',
        mandate_options: PAD_MANDATE_OPTIONS,
      },
    },
  });
}

export async function listPaymentMethods(
  customerId: string,
  type: 'card' | 'acss_debit',
): Promise<Stripe.PaymentMethod[]> {
  const res = await getStripe().customers.listPaymentMethods(customerId, { type, limit: 100 });
  return res.data;
}

export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
): Promise<Stripe.Customer> {
  return getStripe().customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

/**
 * "Is PAD set up + agreed for this payer?" (the question Modules 3/4 ask
 * before offering PAD payment plans). A vaulted acss_debit payment method only
 * exists after a confirmed SetupIntent, i.e. after mandate agreement.
 */
export async function padStatus(
  customerId: string,
): Promise<{ ready: boolean; paymentMethodId: string | null }> {
  const methods = await listPaymentMethods(customerId, 'acss_debit');
  return { ready: methods.length > 0, paymentMethodId: methods[0]?.id ?? null };
}

// ---------------------------------------------------------------------------
// Charges & invoices
// ---------------------------------------------------------------------------

export interface ChargeInput {
  customerId: string;
  amountCents: number;
  /** Vaulted payment method to charge. Omit to use the customer default. */
  paymentMethodId?: string;
  /** 'card' charges settle instantly; 'acss_debit' settles in ~3-5 business days. */
  methodType: 'card' | 'acss_debit';
  currency?: string;
  description?: string;
  metadata?: Record<string, string>;
}

/**
 * "Charge this amount" — an immediate off-session charge against a vaulted
 * payment method. Returns the PaymentIntent; final success/failure arrives via
 * webhook (acss_debit is asynchronous by nature — `processing` is normal).
 */
export async function charge(input: ChargeInput): Promise<Stripe.PaymentIntent> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(`charge(): amountCents must be a positive integer, got ${input.amountCents}`);
  }
  return getStripe().paymentIntents.create({
    customer: input.customerId,
    amount: input.amountCents,
    currency: input.currency ?? 'cad',
    payment_method: input.paymentMethodId,
    payment_method_types: [input.methodType],
    confirm: true,
    off_session: true,
    description: input.description,
    metadata: input.metadata,
  });
}

export interface InvoiceItemInput {
  description: string;
  amountCents: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  items: InvoiceItemInput[];
  /** Days the payer has to pay (send_invoice collection). Default 30. */
  daysUntilDue?: number;
  metadata?: Record<string, string>;
}

/**
 * "Create this invoice" — an emailed/hosted invoice the payer settles online
 * (org billing in Module 1 uses this: invoice + pay-balance-online). Finalized
 * immediately so it has a hosted payment URL.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<Stripe.Invoice> {
  const stripe = getStripe();
  if (input.items.length === 0) throw new Error('createInvoice(): at least one item required');
  for (const item of input.items) {
    if (!Number.isInteger(item.amountCents) || item.amountCents <= 0) {
      throw new Error(`createInvoice(): item amountCents must be a positive integer, got ${item.amountCents}`);
    }
  }

  const invoice = await stripe.invoices.create({
    customer: input.customerId,
    collection_method: 'send_invoice',
    days_until_due: input.daysUntilDue ?? 30,
    currency: 'cad',
    metadata: input.metadata,
    auto_advance: false,
  });
  for (const item of input.items) {
    await stripe.invoiceItems.create({
      customer: input.customerId,
      invoice: invoice.id,
      description: item.description,
      amount: item.amountCents,
      currency: 'cad',
    });
  }
  return stripe.invoices.finalizeInvoice(invoice.id!);
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Verify a webhook payload's signature and return the event. Throws on any
 * mismatch — callers 400 on throw and must pass the RAW request body.
 *
 * Signature verification is pure HMAC crypto — it needs the webhook signing
 * secret, not an API key — so this deliberately does NOT require
 * STRIPE_SECRET_KEY (webhook handling stays testable keyless).
 */
export function verifyWebhook(rawBody: string, signature: string, secret: string): Stripe.Event {
  const client =
    _stripe ?? new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_unused_signature_verify_only');
  return client.webhooks.constructEvent(rawBody, signature, secret);
}
