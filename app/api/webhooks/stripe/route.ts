import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@ai/foundation/stripe';
import { dispatchBillingEvent, mapStripeEvent } from '@ai/foundation';
import { jsonError } from '@/lib/api/handlers';
import { claimWebhookEvent, settleWebhookEvent } from '@/lib/api/webhooks';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook sink (Module 0 §4). Verifies the signature against the RAW
 * body, claims the event id (idempotency — Stripe redelivers), normalizes the
 * event, and fans it out to every onBillingEvent() subscriber. Exempt from
 * Clerk auth in middleware (/api is never rewritten; signature verification
 * IS the authentication).
 *
 * A failed handler answers 500 so Stripe retries the delivery; the claim is
 * released so that retry is processed.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return jsonError('Webhook not configured', 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return jsonError('Missing signature', 400);

  const rawBody = await req.text();
  let event;
  try {
    event = verifyWebhook(rawBody, signature, secret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err);
    return jsonError('Invalid signature', 400);
  }

  const billingEvent = mapStripeEvent(event);
  if (!billingEvent) return NextResponse.json({ received: true, handled: false });

  const claim = await claimWebhookEvent('stripe', event.id, event.type);
  if (!claim.fresh) return NextResponse.json({ received: true, handled: true, duplicate: true });

  const { handlers, failures } = await dispatchBillingEvent(billingEvent);
  await settleWebhookEvent(claim.id, failures);
  if (failures.length) return jsonError('Handler failure — retry requested', 500, { failures: failures.length });
  return NextResponse.json({ received: true, handled: true, handlers });
}
