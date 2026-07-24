import { NextRequest, NextResponse } from 'next/server';
import { ingestResendEvent, type ResendEventType } from '@/lib/comms/stats';

export const dynamic = 'force-dynamic';

/**
 * Resend webhook sink (Module 13 Stage 5/9). Ingests delivered/opened/clicked/
 * bounced/complained/unsubscribed events -> per-recipient stats + auto
 * suppression. Exempt from Clerk auth (/api is never rewritten).
 *
 * Resend signs webhooks with Svix. When RESEND_WEBHOOK_SECRET is set we require
 * the svix headers to be present; full signature verification should be added
 * with the `svix` library before go-live (documented in the README).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !req.headers.get('svix-signature')) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
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
