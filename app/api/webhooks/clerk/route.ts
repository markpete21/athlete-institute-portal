import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { jsonError } from '@/lib/api/handlers';
import { claimWebhookEvent, settleWebhookEvent } from '@/lib/api/webhooks';

export const dynamic = 'force-dynamic';

/**
 * Clerk webhook (identity events). Until now the profile mirror was
 * request-time only: a deleted Clerk user kept an active profile (and any
 * admin access), and email changes waited for the next sign-in.
 *
 *   user.updated → refresh email/name on the mirrored profile
 *   user.deleted → archive the profile and revoke every role
 *
 * Svix signature verification (CLERK_WEBHOOK_SECRET) is the authentication;
 * the Svix message id is the idempotency key.
 */
interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: Array<{ id: string; email_address: string }>;
    deleted?: boolean;
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not set');
    return jsonError('Webhook not configured', 500);
  }
  const rawBody = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };
  let evt: ClerkUserEvent;
  try {
    evt = new Webhook(secret).verify(rawBody, headers) as ClerkUserEvent;
  } catch (err) {
    console.error('[clerk-webhook] signature verification failed:', err);
    return jsonError('Invalid signature', 400);
  }
  if (evt.type !== 'user.updated' && evt.type !== 'user.deleted') return NextResponse.json({ ok: true, ignored: evt.type });

  const claim = await claimWebhookEvent('clerk', headers['svix-id'] || `${evt.type}:${evt.data.id}`, evt.type);
  if (!claim.fresh) return NextResponse.json({ ok: true, duplicate: true });

  const db = supabaseAdmin();
  try {
    const { data: profile } = await db.from('profiles').select('id, email, first_name, last_name, status').eq('clerk_user_id', evt.data.id).maybeSingle();
    if (!profile) {
      await settleWebhookEvent(claim.id, []);
      return NextResponse.json({ ok: true, unknown: true });
    }
    if (evt.type === 'user.deleted') {
      const { error } = await db.from('profiles').update({ status: 'archived' }).eq('id', profile.id);
      if (error) throw new Error(error.message);
      const { error: rErr } = await db.from('role_assignments').delete().eq('profile_id', profile.id);
      if (rErr) throw new Error(rErr.message);
      await audit({ actorId: 'system:clerk', action: 'profile.archived-on-delete', target: `profile:${profile.id}` });
    } else {
      const primary = evt.data.email_addresses?.find((e) => e.id === evt.data.primary_email_address_id)?.email_address
        ?? evt.data.email_addresses?.[0]?.email_address ?? null;
      const patch: Record<string, unknown> = {};
      if (primary && primary !== profile.email) patch.email = primary;
      if (evt.data.first_name !== undefined && evt.data.first_name !== profile.first_name) patch.first_name = evt.data.first_name;
      if (evt.data.last_name !== undefined && evt.data.last_name !== profile.last_name) patch.last_name = evt.data.last_name;
      if (Object.keys(patch).length) {
        const { error } = await db.from('profiles').update(patch).eq('id', profile.id);
        if (error) throw new Error(error.message);
        await audit({ actorId: 'system:clerk', action: 'profile.synced', target: `profile:${profile.id}`, meta: { fields: Object.keys(patch) } });
      }
    }
    await settleWebhookEvent(claim.id, []);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await settleWebhookEvent(claim.id, [err instanceof Error ? err.message : String(err)]);
    return jsonError('sync failed', 500);
  }
}
