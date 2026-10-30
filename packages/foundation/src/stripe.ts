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
import {
  DEFAULT_STRIPE_ACCOUNT,
  STRIPE_ACCOUNTS,
  normalizeStripeAccount,
  stripeAccountConfigured,
  stripeEnvName,
  type StripeAccountId,
} from './stripe-accounts';

const _clients = new Map<StripeAccountId, Stripe>();

/** A value that names which organization's Stripe account to use. */
export type StripeAccountRef = string | null | undefined;

/**
 * The account that will actually be used: the requested one when its secret
 * key is set, else the default — so a row pointing at a not-yet-configured
 * organization degrades to the main account instead of failing mid-payment.
 */
export function resolveStripeAccount(account: StripeAccountRef): StripeAccountId {
  const acct = normalizeStripeAccount(account);
  if (acct !== DEFAULT_STRIPE_ACCOUNT && !stripeAccountConfigured(acct)) {
    console.warn(`[stripe] account "${acct}" has no secret key — using the default account`);
    return DEFAULT_STRIPE_ACCOUNT;
  }
  return acct;
}

/** Lazily-constructed client per Stripe account (organization); default = the original STRIPE_SECRET_KEY. */
export function getStripe(account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT): Stripe {
  const acct = resolveStripeAccount(account);
  const hit = _clients.get(acct);
  if (hit) return hit;
  const envName = stripeEnvName('STRIPE_SECRET_KEY', acct);
  const key = process.env[envName];
  if (!key) throw new Error(`${envName} is not set`);
  const client = new Stripe(key);
  _clients.set(acct, client);
  return client;
}

/** Publishable key for an account (Stripe.js), or null when unset. */
export function stripePublishableKey(account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT): string | null {
  return process.env[stripeEnvName('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', resolveStripeAccount(account))] ?? null;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CreateCustomerInput {
  email: string;
  name?: string;
  /** Always include clerk_user_id so a customer is traceable to its account. */
  metadata: { clerk_user_id: string } & Record<string, string>;
  /** Stripe account (organization) the customer lives in; default account when omitted. */
  account?: StripeAccountRef;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Stripe.Customer> {
  return getStripe(input.account).customers.create({
    email: input.email,
    name: input.name,
    metadata: input.metadata,
  });
}

/** Look up an existing customer by Clerk user id (metadata search) in one account. */
export async function findCustomerByClerkId(
  clerkUserId: string,
  account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT,
): Promise<Stripe.Customer | null> {
  const res = await getStripe(account).customers.search({
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
export async function createCardSetupIntent(
  customerId: string,
  account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT,
): Promise<Stripe.SetupIntent> {
  return getStripe(account).setupIntents.create({
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
export async function createPadSetupIntent(
  customerId: string,
  account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT,
): Promise<Stripe.SetupIntent> {
  return getStripe(account).setupIntents.create({
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
  account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT,
): Promise<Stripe.PaymentMethod[]> {
  const res = await getStripe(account).customers.listPaymentMethods(customerId, { type, limit: 100 });
  return res.data;
}

export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT,
): Promise<Stripe.Customer> {
  return getStripe(account).customers.update(customerId, {
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
  account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT,
): Promise<{ ready: boolean; paymentMethodId: string | null }> {
  const methods = await listPaymentMethods(customerId, 'acss_debit', account);
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
  /** Stripe account (organization) to charge in — must be the customer's account. */
  account?: StripeAccountRef;
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
  return getStripe(input.account).paymentIntents.create({
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
  /** Stripe account (organization) to invoice from — must be the customer's account. */
  account?: StripeAccountRef;
}

/**
 * "Create this invoice" — an emailed/hosted invoice the payer settles online
 * (org billing in Module 1 uses this: invoice + pay-balance-online). Finalized
 * immediately so it has a hosted payment URL.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<Stripe.Invoice> {
  const stripe = getStripe(input.account);
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
// Hosted checkout (Stripe-hosted payment page)
// ---------------------------------------------------------------------------

export interface HostedCheckoutInput {
  /** Attach to an existing customer so the card can be reused later. */
  customerId?: string | null;
  amountCents: number;
  /** Line shown on the Stripe page, e.g. "Payment plan installment". */
  description: string;
  /** Copied onto the PaymentIntent — the webhook settles from this. */
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  /** Stripe account (organization) the payment settles in. */
  account?: StripeAccountRef;
}

/**
 * A one-off hosted payment page (Checkout Session, mode=payment). This is the
 * first CLIENT-facing payment surface — no Stripe.js bundle needed, Stripe
 * hosts the card form. Card-only for now: acss_debit on Checkout needs PAD
 * enabled on the live account (unconfirmed), and PAD's 3-5 day settlement
 * reads badly on a "pay now" button anyway.
 */
export async function createHostedCheckout(input: HostedCheckoutInput): Promise<Stripe.Checkout.Session> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(`createHostedCheckout: bad amount ${input.amountCents}`);
  }
  return getStripe(input.account).checkout.sessions.create({
    mode: 'payment',
    customer: input.customerId ?? undefined,
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'cad',
          unit_amount: input.amountCents,
          product_data: { name: input.description },
        },
      },
    ],
    payment_intent_data: { metadata: input.metadata },
    metadata: input.metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/** Retrieve a Checkout Session (payment status + metadata) by id. */
export async function getHostedCheckout(
  sessionId: string,
  account: StripeAccountRef = DEFAULT_STRIPE_ACCOUNT,
): Promise<Stripe.Checkout.Session> {
  return getStripe(account).checkout.sessions.retrieve(sessionId);
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
    _clients.get(DEFAULT_STRIPE_ACCOUNT) ??
    new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_unused_signature_verify_only');
  return client.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Verify against EVERY configured account's signing secret (each organization
 * has its own endpoint pointing at the same URL) and report which account
 * signed it. Throws when none match or none are configured.
 */
export function verifyWebhookAny(
  rawBody: string,
  signature: string,
): { event: Stripe.Event; account: StripeAccountId } {
  let lastErr: unknown = null;
  let any = false;
  for (const a of STRIPE_ACCOUNTS) {
    const secret = process.env[stripeEnvName('STRIPE_WEBHOOK_SECRET', a.id)];
    if (!secret) continue;
    any = true;
    try {
      return { event: verifyWebhook(rawBody, signature, secret), account: a.id };
    } catch (err) {
      lastErr = err;
    }
  }
  if (!any) throw new Error('No STRIPE_WEBHOOK_SECRET configured for any account');
  throw lastErr ?? new Error('Webhook signature did not match any account');
}
