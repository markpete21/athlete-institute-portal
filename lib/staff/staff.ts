import 'server-only';
import {
  audit,
  can,
  deriveStaffStatus,
  generatePaySchedule,
  recomputeWithAbsences,
  resolveCapabilities,
  torontoToday,
  type CapabilityGrant,
  type PayFrequency,
  type PayMode,
  type ResolvedCapability,
} from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Staff module API (Module 5) - records, roles, per-assignment pay, the
 * capability matrix, pay scheduling, absence/replacement, certs, and the
 * pay-cost feed for Module 4 margin. Pay is TRACKED, never moved.
 */

export interface Staff {
  id: number;
  profile_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  bio: string | null;
  photo_url: string | null;
  status: 'active' | 'inactive' | 'archived';
}

const S_COLS = 'id, profile_id, first_name, last_name, email, bio, photo_url, status';

export async function createStaff(input: { firstName: string; lastName: string; email?: string | null; bio?: string | null; photoUrl?: string | null; profileId?: number | null }, actorClerkId: string): Promise<Staff> {
  const { data, error } = await supabaseAdmin()
    .from('staff')
    .insert({ first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email ?? null, bio: input.bio ?? null, photo_url: input.photoUrl ?? null, profile_id: input.profileId ?? null, created_by: actorClerkId })
    .select(S_COLS)
    .single();
  if (error) throw new Error(`staff create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'staff.created', target: `staff:${data.id}`, meta: { name: `${input.firstName} ${input.lastName}`, accountLess: !input.profileId } });
  return data as Staff;
}

/** Upgrade an account-less coach: attach an email for a later Clerk invite. */
export async function addStaffEmail(staffId: number, email: string, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff').update({ email: email.trim().toLowerCase() }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.email-added', target: `staff:${staffId}`, meta: { email } });
  // (A Clerk invite is sent by ops/onboarding; recorded here as the upgrade intent.)
}

export async function archiveStaff(staffId: number, actorClerkId: string, archived = true): Promise<void> {
  const { error } = await supabaseAdmin().from('staff').update({ status: archived ? 'archived' : 'inactive', archived_at: archived ? new Date().toISOString() : null }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: archived ? 'staff.archived' : 'staff.unarchived', target: `staff:${staffId}` });
}

/** Recompute active/inactive from assignments + outstanding pay (archive sticks). */
export async function refreshStaffStatus(staffId: number): Promise<Staff['status']> {
  const db = supabaseAdmin();
  const { data: staff } = await db.from('staff').select('status, archived_at').eq('id', staffId).single();
  if (staff!.archived_at) return 'archived';
  const today = torontoToday();

  const { data: assigns } = await db.from('staff_assignments').select('id, program_id, active').eq('staff_id', staffId).eq('active', true);
  let hasCurrent = false;
  for (const a of assigns ?? []) {
    const { data: sess } = await db.from('program_sessions').select('ends_at').eq('program_id', a.program_id).order('ends_at', { ascending: false }).limit(1).maybeSingle();
    if (!sess || sess.ends_at.slice(0, 10) >= today) { hasCurrent = true; break; } // upcoming/ongoing (or no sessions yet)
  }

  const assignIds = (assigns ?? []).map((a) => a.id);
  let hasOutstanding = false;
  if (assignIds.length) {
    const { count } = await db.from('staff_pay_dates').select('id', { count: 'exact', head: true }).in('assignment_id', assignIds).eq('status', 'outstanding');
    hasOutstanding = (count ?? 0) > 0;
  }

  const next = deriveStaffStatus({ archived: false, hasCurrentOrUpcomingAssignment: hasCurrent, hasOutstandingPay: hasOutstanding });
  await db.from('staff').update({ status: next }).eq('id', staffId);
  return next;
}

// --- Capability matrix ------------------------------------------------------

export async function setCapability(roleId: number, capability: string, canView: boolean, canEdit: boolean, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('role_capabilities').upsert({ role_id: roleId, capability, can_view: canView, can_edit: canEdit }, { onConflict: 'role_id,capability' });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'capability.set', target: `role:${roleId}`, meta: { capability, canView, canEdit } });
}

/** Resolve a profile's effective capabilities across all their roles. */
export async function capabilitiesForProfile(profileId: number): Promise<Record<string, ResolvedCapability>> {
  const db = supabaseAdmin();
  const { data: roleRows } = await db.from('role_assignments').select('role_id').eq('profile_id', profileId);
  const roleIds = (roleRows ?? []).map((r) => r.role_id);
  if (!roleIds.length) return {};
  const { data: caps } = await db.from('role_capabilities').select('role_id, capability, can_view, can_edit').in('role_id', roleIds);
  const byRole = new Map<number, CapabilityGrant[]>();
  for (const c of caps ?? []) byRole.set(c.role_id, [...(byRole.get(c.role_id) ?? []), { capability: c.capability, can_view: c.can_view, can_edit: c.can_edit }]);
  return resolveCapabilities([...byRole.values()]);
}

export async function profileCan(profileId: number, capability: string, mode: 'view' | 'edit' = 'view'): Promise<boolean> {
  return can(await capabilitiesForProfile(profileId), capability, mode);
}

// --- Assignment + pay -------------------------------------------------------

export async function assignStaffToProgram(input: { staffId: number; programId: number; roleLabel?: string | null; payMode: PayMode; rateCents: number; frequency: PayFrequency; units?: number; showPublic?: boolean; programStartISO: string; programEndISO: string }, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('staff_assignments')
    .insert({ staff_id: input.staffId, program_id: input.programId, role_label: input.roleLabel ?? null, pay_mode: input.payMode, rate_cents: input.rateCents, frequency: input.frequency, show_public: input.showPublic ?? true })
    .select('id')
    .single();
  if (error) throw new Error(`assign failed: ${error.message}`);
  const assignmentId = data.id as number;

  // Generate the pay schedule.
  const schedule = generatePaySchedule({ mode: input.payMode, rateCents: input.rateCents, frequency: input.frequency, programStartISO: input.programStartISO, programEndISO: input.programEndISO, units: input.units });
  if (schedule.length) {
    const { error: pErr } = await db.from('staff_pay_dates').insert(schedule.map((p) => ({ assignment_id: assignmentId, due_date: p.dueDate, amount_cents: p.amountCents })));
    if (pErr) throw new Error(`pay schedule failed: ${pErr.message}`);
  }
  await audit({ actorId: actorClerkId, action: 'staff.assigned', target: `staff:${input.staffId}`, meta: { program_id: input.programId, pay_mode: input.payMode, rate: input.rateCents, payDates: schedule.length } });
  await refreshStaffStatus(input.staffId);
  return assignmentId;
}

/** Mark a session absent + record a replacement at an entered rate. */
export async function recordAbsence(input: { assignmentId: number; sessionDateISO: string; replacementStaffId?: number | null; replacementRateCents?: number | null }, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_session_absences').upsert({ assignment_id: input.assignmentId, session_date: input.sessionDateISO, replacement_staff_id: input.replacementStaffId ?? null, replacement_rate_cents: input.replacementRateCents ?? null, created_by: actorClerkId }, { onConflict: 'assignment_id,session_date' });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.absence-recorded', target: `staff_assignment:${input.assignmentId}`, meta: { session: input.sessionDateISO, replacement: input.replacementStaffId } });
}

/** Original + replacement owed for an assignment after absences (per-session). */
export async function payBreakdown(assignmentId: number, totalUnits: number): Promise<{ originalCents: number; replacementCents: number }> {
  const db = supabaseAdmin();
  const { data: a } = await db.from('staff_assignments').select('pay_mode, rate_cents').eq('id', assignmentId).single();
  const { data: abs } = await db.from('staff_session_absences').select('replacement_rate_cents').eq('assignment_id', assignmentId);
  return recomputeWithAbsences({ mode: a!.pay_mode as PayMode, originalRateCents: a!.rate_cents, totalUnits, absences: (abs ?? []).map((x) => ({ replacementRateCents: x.replacement_rate_cents ?? 0 })) });
}

/** Total staff pay cost for a program (feeds Module 4 margin). */
export async function programStaffCostCents(programId: number): Promise<number> {
  const db = supabaseAdmin();
  const { data: assigns } = await db.from('staff_assignments').select('id').eq('program_id', programId);
  const ids = (assigns ?? []).map((a) => a.id);
  if (!ids.length) return 0;
  const { data: pays } = await db.from('staff_pay_dates').select('amount_cents').in('assignment_id', ids);
  return (pays ?? []).reduce((a, p) => a + p.amount_cents, 0);
}

// --- Certifications ---------------------------------------------------------

export async function addCertification(input: { staffId: number; name: string; obtainedOn?: string | null; expiresOn?: string | null }, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_certifications').insert({ staff_id: input.staffId, name: input.name.trim(), obtained_on: input.obtainedOn ?? null, expires_on: input.expiresOn ?? null });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.cert-added', target: `staff:${input.staffId}`, meta: { name: input.name } });
}

/** Warn-only cert expiry notices (cron). Never blocks assignment. */
export async function processCertExpiries(): Promise<{ warned: number }> {
  const db = supabaseAdmin();
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const { data: due } = await db
    .from('staff_certifications')
    .select('id, name, expires_on, staff(first_name, last_name, email)')
    .not('expires_on', 'is', null)
    .lte('expires_on', soon)
    .is('reminded_at', null);
  let warned = 0;
  for (const c of due ?? []) {
    const s = c.staff as unknown as { first_name: string; last_name: string; email: string | null };
    await notify({
      to: { email: process.env.OPERATIONS_EMAIL ?? 'mark.peterson@athleteinstitute.ca' },
      channels: ['email'],
      template: 'generic',
      data: { heading: 'Staff certification expiring', body: `${s.first_name} ${s.last_name}'s "${c.name}" expires ${c.expires_on}. Please follow up on renewal (assignments are not blocked).`, ctaLabel: 'Open staff', ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/staff` },
    });
    await db.from('staff_certifications').update({ reminded_at: new Date().toISOString() }).eq('id', c.id);
    warned++;
  }
  return { warned };
}

// --- Unavailability (staff self-service) ------------------------------------

export async function submitUnavailability(staffId: number, dateISO: string, note: string | null): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_unavailability').upsert({ staff_id: staffId, date: dateISO, note }, { onConflict: 'staff_id,date' });
  if (error) throw new Error(error.message);
}
