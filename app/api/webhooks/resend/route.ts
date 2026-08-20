import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { ingestResendEvent, type ResendEventType } from '@/lib/comms/stats';

export const dynamic = 'force-dynamic';

/**
 * Resend webhook sink (Module 13 Stage 5/9). Ingests delivered/opened/clicked/
 * bounced/complained/unsubscribed events -> per-recipient stats + auto
 * suppression. Exempt from Clerk auth (/api is never rewritten).
 *
 * Resend signs webhooks with Svix. The signature is verified against the RAW
 * body with RESEND_WEBHOOK_SECRET (signature verification IS the
 * authentication, same as the Stripe sink). Unverified requests are rejected
 * before any side effects.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = new Webhook(secret).verify(rawBody, headers) as { type?: string; data?: Record<string, unknown> };
  } catch (err) {
    console.error('[resend-webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const type = payload.type as ResendEventType | undefined;
  const data = payload.data ?? {};
  const known: ResendEventType[] = ['email.delivered', 'email.bounced', 'email.opened', 'email.clicked', 'email.complained', 'email.unsubscribed'];
  if (!type || !known.includes(type)) return NextResponse.json({ ok: true, ignored: type ?? 'unknown' });

  const to = Array.isArray(data.to) ? (data.to[0] as string) : (data.to as string | undefined);
  const click = data.click as { link?: string } | undefined;
  const matched = await ingestResendEvent({
    type,
    messageId: (data.email_id as string) ?? null,
    email: to ?? null,
    url: click?.link ?? null,
  });

  return NextResponse.json({ ok: true, matched });
}
