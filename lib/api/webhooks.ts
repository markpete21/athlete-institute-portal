import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Inbound-webhook idempotency ledger (migration 0067). Every provider
 * redelivers: Stripe on any non-2xx, Resend/Svix on timeouts, and both on
 * their own retry schedules. The route claims the event id BEFORE running
 * handlers; a second delivery of the same id is acknowledged and skipped.
 *
 *   const claim = await claimWebhookEvent('stripe', event.id, event.type);
 *   if (!claim.fresh) return 200;            // already handled
 *   ... run handlers ...
 *   await settleWebhookEvent(claim.id, failures);
 *
 * A failed handler is recorded and the row is RELEASED (deleted) so the
 * provider's retry gets a fresh attempt.
 */

export async function claimWebhookEvent(provider: string, externalId: string, eventType?: string | null): Promise<{ fresh: boolean; id: number | null }> {
  const { data, error } = await supabaseAdmin()
    .from('webhook_events')
    .insert({ provider, external_id: externalId, event_type: eventType ?? null })
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { fresh: false, id: null }; // seen before
    throw new Error(`webhook_events claim failed: ${error.message}`);
  }
  return { fresh: true, id: data?.id ?? null };
}

export async function settleWebhookEvent(id: number | null, failures: string[]): Promise<void> {
  if (id === null) return;
  const db = supabaseAdmin();
  if (failures.length === 0) {
    await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', id);
    return;
  }
  // Release the claim so the provider's redelivery can try again; keep the
  // error in the row's place via the audit log for diagnosis.
  await db.from('webhook_events').delete().eq('id', id);
  console.error(`[webhook] handlers failed (${failures.length}):`, failures.join(' | '));
}

/**
 * Once-per-window guard for scheduled sends (exec reports, digests). Returns
 * true when this call won the window and should send; false when a previous
 * run already did.
 */
export async function claimScheduledSend(kind: string, windowKey: string, detail?: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabaseAdmin().from('scheduled_send_log').insert({ kind, window_key: windowKey, detail: detail ?? null });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`scheduled_send_log claim failed: ${error.message}`);
}
