import 'server-only';
import { audit, formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { fireTrigger } from '@/lib/comms/notifications';

/**
 * Automated dunning (Module 18A) - the escalating recovery sequence for failed
 * PAD/card installments, so no one catches them manually:
 *
 *   failed -> auto-RETRY after X days -> EMAIL w/ pay link after X days
 *   -> SMS after Y days -> STAFF CALL TASK + account flagged Overdue.
 *
 * Every step's timing is configurable (dunning_config); every message is an
 * editable Module 13 template (dunning.email / dunning.sms / dunning.task).
 * Charges go through the Module 0 Stripe rails; recovery closes the case and
 * clears the flag. Especially for Academy tuition PAD plans (M12).
 */

export interface DunningConfig { retryAfterDays: number; emailAfterDays: number; smsAfterDays: number; taskAfterDays: number }

export async function dunningConfig(): Promise<DunningConfig> {
  const { data } = await supabaseAdmin().from('dunning_config').select('*').eq('id', 1).single();
  return {
    retryAfterDays: data?.retry_after_days ?? 3,
    emailAfterDays: data?.email_after_days ?? 5,
    smsAfterDays: data?.sms_after_days ?? 10,
    taskAfterDays: data?.task_after_days ?? 14,
  };
}

export async function updateDunningConfig(patch: Partial<DunningConfig>, actorClerkId: string): Promise<void> {
  const map: Record<string, unknown> = {};
  if (patch.retryAfterDays != null) map.retry_after_days = patch.retryAfterDays;
  if (patch.emailAfterDays != null) map.email_after_days = patch.emailAfterDays;
  if (patch.smsAfterDays != null) map.sms_after_days = patch.smsAfterDays;
  if (patch.taskAfterDays != null) map.task_after_days = patch.taskAfterDays;
  await supabaseAdmin().from('dunning_config').update({ ...map, updated_by: actorClerkId, updated_at: new Date().toISOString() }).eq('id', 1);
  await audit({ actorId: actorClerkId, action: 'dunning.config-updated', target: 'dunning_config', meta: patch });
}

/** Open a dunning case when an installment fails (idempotent per installment). */
export async function openCase(installmentId: number, opts: { failedAt?: string } = {}): Promise<number | null> {
  const db = supabaseAdmin();
  const { data: inst } = await db.from('program_installments').select('id, order_id, program_orders(family_id)').eq('id', installmentId).single();
  if (!inst) return null;
  const familyId = (inst.program_orders as unknown as { family_id: number | null } | null)?.family_id ?? null;
  const { data, error } = await db
    .from('dunning_cases')
    .upsert({ installment_id: installmentId, order_id: inst.order_id, family_id: familyId, failed_at: opts.failedAt ?? new Date().toISOString() }, { onConflict: 'installment_id', ignoreDuplicates: true })
    .select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (data) await audit({ actorId: 'system:dunning', action: 'dunning.case-opened', target: `installment:${installmentId}` });
  return data?.id ?? null;
}

/** Mark an installment recovered (paid): close the case, clear Overdue if last. */
export async function markRecovered(installmentId: number): Promise<void> {
  const db = supabaseAdmin();
  const { data: c } = await db.from('dunning_cases').select('id, family_id').eq('installment_id', installmentId).maybeSingle();
  if (!c) return;
  await db.from('dunning_cases').update({ step: 'recovered', recovered_at: new Date().toISOString(), step_at: new Date().toISOString() }).eq('id', c.id);
  if (c.family_id) {
    const { count: open } = await db.from('dunning_cases').select('id', { count: 'exact', head: true }).eq('family_id', c.family_id).is('recovered_at', null);
    if ((open ?? 0) === 0) await db.from('families').update({ overdue: false }).eq('id', c.family_id);
  }
  await audit({ actorId: 'system:dunning', action: 'dunning.recovered', target: `installment:${installmentId}` });
}

async function familyContact(familyId: number | null): Promise<{ email: string | null; phone: string | null; name: string }> {
  if (!familyId) return { email: null, phone: null, name: 'Unknown family' };
  const db = supabaseAdmin();
  const { data: fam } = await db.from('families').select('name, hoh_profile_id').eq('id', familyId).maybeSingle();
  if (!fam?.hoh_profile_id) return { email: null, phone: null, name: fam?.name ?? 'Unknown family' };
  const { data: prof } = await db.from('profiles').select('email, phone, first_name').eq('id', fam.hoh_profile_id).maybeSingle();
  return { email: prof?.email ?? null, phone: prof?.phone ?? null, name: fam.name };
}

export interface ProcessResult { retried: number; emailed: number; smsed: number; tasksCreated: number }

/**
 * Advance every open case through the escalation ladder (cron; also callable
 * with a fake "now" for tests). Steps fire strictly in order; each step runs
 * once. The retry hook charges via the Stripe rails when a PAD/card method is
 * on file (delegated to the M4 processor); here we advance the state machine
 * and dispatch the configured message per step.
 */
export async function processDunning(opts: { now?: Date; retryCharge?: (installmentId: number) => Promise<boolean> } = {}): Promise<ProcessResult> {
  const db = supabaseAdmin();
  const cfg = await dunningConfig();
  const now = (opts.now ?? new Date()).getTime();
  const out: ProcessResult = { retried: 0, emailed: 0, smsed: 0, tasksCreated: 0 };

  const { data: cases } = await db
    .from('dunning_cases')
    .select('id, installment_id, family_id, failed_at, step, program_installments:installment_id(amount_cents, order_id)')
    .is('recovered_at', null)
    .neq('step', 'task_created')
    .neq('step', 'written_off');

  const payUrl = `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/account`;
  for (const c of cases ?? []) {
    const inst = c.program_installments as unknown as { amount_cents: number } | null;
    const amount = formatCAD(inst?.amount_cents ?? 0);
    const daysSince = (now - Date.parse(c.failed_at)) / 86_400_000;
    const contact = await familyContact(c.family_id);

    if (c.step === 'failed' && daysSince >= cfg.retryAfterDays) {
      // 1. auto-retry the charge (Stripe rails via the injected/actual processor).
      const recovered = opts.retryCharge ? await opts.retryCharge(c.installment_id) : false;
      if (recovered) { await markRecovered(c.installment_id); continue; }
      await db.from('dunning_cases').update({ step: 'retried', step_at: new Date(now).toISOString() }).eq('id', c.id);
      out.retried += 1;
    } else if (c.step === 'retried' && daysSince >= cfg.emailAfterDays) {
      // 2. email with a pay-now link (editable M13 template).
      if (contact.email) await fireTrigger('dunning.email', { email: contact.email }, { first_name: contact.name, amount, program_name: 'your program', pay_url: payUrl });
      await db.from('dunning_cases').update({ step: 'emailed', step_at: new Date(now).toISOString() }).eq('id', c.id);
      out.emailed += 1;
    } else if (c.step === 'emailed' && daysSince >= cfg.smsAfterDays) {
      // 3. SMS.
      await fireTrigger('dunning.sms', { email: contact.email, phone: contact.phone }, { amount, program_name: 'your program', pay_url: payUrl });
      await db.from('dunning_cases').update({ step: 'smsed', step_at: new Date(now).toISOString() }).eq('id', c.id);
      out.smsed += 1;
    } else if (c.step === 'smsed' && daysSince >= cfg.taskAfterDays) {
      // 4. staff call task + Overdue flag - the only human step.
      await db.from('retention_tasks').insert({ kind: 'call', note: `Dunning: ${contact.name} owes ${amount} (installment ${c.installment_id})`, created_by: 'system:dunning' });
      if (process.env.OPERATIONS_EMAIL) await fireTrigger('dunning.task', { email: process.env.OPERATIONS_EMAIL }, { family: contact.name, amount });
      if (c.family_id) await db.from('families').update({ overdue: true }).eq('id', c.family_id);
      await db.from('dunning_cases').update({ step: 'task_created', step_at: new Date(now).toISOString() }).eq('id', c.id);
      out.tasksCreated += 1;
    }
  }
  return out;
}
