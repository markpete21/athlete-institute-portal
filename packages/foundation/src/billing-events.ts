/**
 * Billing events (Module 0 §4) — "webhook handling: payment success/failure →
 * event other modules subscribe to."
 *
 * Stripe's webhook fires into the portal's /api/webhooks/stripe route, which
 * verifies the signature and calls `mapStripeEvent()`; the normalized event is
 * then handed to every handler registered with `onBillingEvent()`. Later
 * modules subscribe from their own code (M3 rental payment schedules, M4
 * payment plans + dunning, M18 escalation) without touching the route.
 *
 * Edge-safe: type-only Stripe import, no client construction here.
 */

import type Stripe from 'stripe';

export type BillingEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.processing' // acss_debit sits here for ~3-5 business days
  | 'setup.completed' // a payment method was vaulted (card or PAD mandate agreed)
  | 'invoice.paid'
  | 'invoice.payment_failed';

export interface BillingEvent {
  type: BillingEventType;
  /** Stripe event id — handlers use it for idempotency. */
  stripeEventId: string;
  customerId: string | null;
  amountCents: number | null;
  currency: string | null;
  /** PaymentIntent / SetupIntent / Invoice id, per type. */
  objectId: string;
  paymentMethodType: 'card' | 'acss_debit' | null;
  /** Failure detail when type is *.failed. */
  failureMessage: string | null;
  metadata: Record<string, string>;
}

export type BillingEventHandler = (event: BillingEvent) => void | Promise<void>;

const handlers = new Map<BillingEventType | '*', Set<BillingEventHandler>>();

/** Subscribe to a billing event ('*' for all). Returns an unsubscribe fn. */
export function onBillingEvent(
  type: BillingEventType | '*',
  handler: BillingEventHandler,
): () => void {
  const set = handlers.get(type) ?? new Set();
  set.add(handler);
  handlers.set(type, set);
  return () => set.delete(handler);
}

/** Run every subscriber for the event; a throwing handler doesn't block others. */
export async function dispatchBillingEvent(event: BillingEvent): Promise<void> {
  const subs = [...(handlers.get(event.type) ?? []), ...(handlers.get('*') ?? [])];
  const results = await Promise.allSettled(subs.map((h) => h(event)));
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(`[billing-events] handler failed for ${event.type}:`, r.reason);
    }
  }
}

const customerIdOf = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null =>
  typeof c === 'string' ? c : (c?.id ?? null);

/**
 * Normalize a verified Stripe event into a BillingEvent, or null for event
 * types the platform doesn't consume (fine to ignore — Stripe sends many).
 */
export function mapStripeEvent(event: Stripe.Event): BillingEvent | null {
  const base = { stripeEventId: event.id, failureMessage: null as string | null };

  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.processing':
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const type: BillingEventType =
        event.type === 'payment_intent.succeeded'
          ? 'payment.succeeded'
          : event.type === 'payment_intent.processing'
            ? 'payment.processing'
            : 'payment.failed';
      return {
        ...base,
        type,
        customerId: customerIdOf(pi.customer),
        amountCents: pi.amount,
        currency: pi.currency,
        objectId: pi.id,
        paymentMethodType: (pi.payment_method_types?.[0] as 'card' | 'acss_debit') ?? null,
        failureMessage: pi.last_payment_error?.message ?? null,
        metadata: (pi.metadata ?? {}) as Record<string, string>,
      };
    }
    case 'setup_intent.succeeded': {
      const si = event.data.object as Stripe.SetupIntent;
      return {
        ...base,
        type: 'setup.completed',
        customerId: customerIdOf(si.customer),
        amountCents: null,
        currency: null,
        objectId: si.id,
        paymentMethodType: (si.payment_method_types?.[0] as 'card' | 'acss_debit') ?? null,
        metadata: (si.metadata ?? {}) as Record<string, string>,
      };
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      return {
        ...base,
        type: event.type === 'invoice.paid' ? 'invoice.paid' : 'invoice.payment_failed',
        customerId: customerIdOf(inv.customer ?? null),
        amountCents: inv.amount_due,
        currency: inv.currency,
        objectId: inv.id ?? '',
        paymentMethodType: null,
        metadata: (inv.metadata ?? {}) as Record<string, string>,
      };
    }
    default:
      return null;
  }
}
