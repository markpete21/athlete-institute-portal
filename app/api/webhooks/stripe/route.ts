import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@ai/foundation/stripe';
import { dispatchBillingEvent, mapStripeEvent } from '@ai/foundation';

/**
 * Stripe webhook sink (Module 0 §4). Verifies the signature against the RAW
 * body, normalizes the event, and fans it out to every onBillingEvent()
 * subscriber. Exempt from Clerk auth in middleware (/api is never rewritten;
 * signature verification IS the authentication).
 *
 * Handlers must be idempotent on stripeEventId — Stripe retries delivery.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const rawBody = await req.text();
  let event;
  try {
    event = verifyWebhook(rawBody, signature, secret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const billingEvent = mapStripeEvent(event);
  if (billingEvent) {
    // Stage 4: log every consumed event (the audit-log utility in Stage 8
    // upgrades this to a durable trail). Modules subscribe via onBillingEvent.
    console.log(
      `[stripe-webhook] ${billingEvent.type} ${billingEvent.objectId}` +
        (billingEvent.amountCents != null ? ` ${billingEvent.amountCents} ${billingEvent.currency}` : ''),
    );
    await dispatchBillingEvent(billingEvent);
  }

  return NextResponse.json({ received: true, handled: billingEvent !== null });
}
