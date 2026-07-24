import 'server-only';
import { audit, renderMergeTags } from '@ai/foundation';
import { notify, type NotifyChannel } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Auto-notifications (Module 13 Stage 6) + suppression list (Stage 9). Each
 * trigger is an editable template with a default, merge tags, channel selection
 * and an on/off toggle. fireTrigger() is the single entry other modules call.
 */

export interface AutoNotification {
  trigger_key: string;
  label: string;
  enabled: boolean;
  channels: NotifyChannel[];
  subject: string | null;
  body_template: string | null;
  is_marketing: boolean;
}

export async function listTriggers(): Promise<AutoNotification[]> {
  const { data } = await supabaseAdmin().from('comms_auto_notifications').select('*').order('label');
  return (data ?? []) as AutoNotification[];
}

export async function updateTrigger(triggerKey: string, patch: Partial<Pick<AutoNotification, 'enabled' | 'channels' | 'subject' | 'body_template'>>, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('comms_auto_notifications').update({ ...patch, updated_by: actorClerkId, updated_at: new Date().toISOString() }).eq('trigger_key', triggerKey);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'comms.trigger-updated', target: `trigger:${triggerKey}`, meta: patch });
}

/**
 * Fire an auto-notification: respects the on/off toggle + configured channels,
 * renders the template's merge tags, and sends via notify(). No-ops (returns
 * false) if the trigger is disabled. Suppression is honored for marketing
 * triggers only; transactional messages always send.
 */
export async function fireTrigger(triggerKey: string, to: { email?: string | null; phone?: string | null }, data: Record<string, string | number>, brandKey?: string | null): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: t } = await db.from('comms_auto_notifications').select('*').eq('trigger_key', triggerKey).maybeSingle();
  if (!t || !t.enabled) return false;
  if (t.is_marketing && to.email && (await isSuppressed(to.email))) return false;

  await notify({
    to,
    channels: t.channels as NotifyChannel[],
    template: 'generic',
    data: { heading: renderMergeTags(t.subject ?? '', data), body: renderMergeTags(t.body_template ?? '', data) },
    brandKey,
  });
  return true;
}

// --- suppression list -------------------------------------------------------

export async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from('comms_suppressions').select('email').eq('email', email).maybeSingle();
  return !!data;
}

export async function suppress(email: string, reason: 'hard_bounce' | 'unsubscribe' | 'complaint'): Promise<void> {
  await supabaseAdmin().from('comms_suppressions').upsert({ email, reason }, { onConflict: 'email' });
}

export async function unsuppress(email: string): Promise<void> {
  await supabaseAdmin().from('comms_suppressions').delete().eq('email', email);
}
