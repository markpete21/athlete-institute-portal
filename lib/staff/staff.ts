import 'server-only';
import {
  audit,
  can,
  currentSeason,
  deriveStaffStatus,
  generatePaySchedule,
  originalOwedAfterReplacement,
  recomputeWithAbsences,
  resolveCapabilities,
  torontoDate,
  torontoToday,
  type CapabilityGrant,
  type PayFrequency,
  type PayMode,
  type ResolvedCapability,
} from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { deleteFile, getPublicUrl, uploadFile } from '@ai/foundation/storage';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Staff module API (Module 5) - records, roles, per-assignment pay, the
 * capability matrix, pay scheduling, absence/replacement, certs, and the
 * pay-cost feed for Module 4 margin. Pay is TRACKED, never moved.
 */

export type StaffEmployment = 'employee' | 'contractor' | 'volunteer';

export interface Staff {
  id: number;
  profile_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  photo_url: string | null;
  status: 'active' | 'inactive' | 'archived';
  /** employee = Wagepoint payroll, contractor = invoices/QB bills, volunteer = no pay. */
  employment: StaffEmployment | null;
}

const S_COLS = 'id, profile_id, first_name, last_name, email, phone, bio, photo_url, status, employment';

export async function createStaff(input: { firstName: string; lastName: string; email?: string | null; phone?: string | null; bio?: string | null; photoUrl?: string | null; profileId?: number | null; employment?: StaffEmployment | null }, actorClerkId: string): Promise<Staff> {
  const { data, error } = await supabaseAdmin()
    .from('staff')
    .insert({ first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email ?? null, phone: input.phone?.trim() || null, bio: input.bio ?? null, photo_url: input.photoUrl ?? null, profile_id: input.profileId ?? null, employment: input.employment ?? null, created_by: actorClerkId })
    .select(S_COLS)
    .single();
  if (error) throw new Error(`staff create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'staff.created', target: `staff:${data.id}`, meta: { name: `${input.firstName} ${input.lastName}`, accountLess: !input.profileId } });
  return data as Staff;
}

/**
 * Upgrade an account-less coach: attach an email for a later Clerk invite.
 * If a portal profile already exists for that email, link it immediately -
 * the coach's existing login becomes their staff login with no invite needed.
 */
export async function addStaffEmail(staffId: number, email: string, actorClerkId: string): Promise<{ linkedProfileId: number | null }> {
  const db = supabaseAdmin();
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await db.from('profiles').select('id').eq('email', normalized).maybeSingle();
  const { error } = await db.from('staff').update({ email: normalized, ...(existing ? { profile_id: existing.id } : {}) }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.email-added', target: `staff:${staffId}`, meta: { email: normalized, linkedProfileId: existing?.id ?? null } });
  // (Without an existing profile, a Clerk invite is sent by ops/onboarding;
  // recorded here as the upgrade intent. getOrCreateProfile links by verified
  // email on their first sign-in.)
  return { linkedProfileId: existing?.id ?? null };
}

export async function updateStaffDetails(staffId: number, input: { firstName?: string; lastName?: string; email?: string | null; phone?: string | null; bio?: string | null; employment?: StaffEmployment | null }, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName.trim();
  if (input.lastName !== undefined) patch.last_name = input.lastName.trim();
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.bio !== undefined) patch.bio = input.bio?.trim() || null;
  if (input.employment !== undefined) patch.employment = input.employment;
  if (input.email !== undefined) {
    const email = input.email?.trim().toLowerCase() || null;
    patch.email = email;
    // A not-yet-linked record adopts an existing profile on email change,
    // same as addStaffEmail. An existing profile link is never touched here.
    if (email) {
      const { data: staffRow } = await db.from('staff').select('profile_id').eq('id', staffId).single();
      if (staffRow && !staffRow.profile_id) {
        const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
        if (existing) patch.profile_id = existing.id;
      }
    }
  }
  if (!Object.keys(patch).length) return;
  const { error } = await db.from('staff').update(patch).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.updated', target: `staff:${staffId}`, meta: patch });
}

const PHOTO_EXTS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Upload/replace a staff photo (public bucket - these render on public pages). */
export async function uploadStaffPhoto(staffId: number, bytes: ArrayBuffer, contentType: string, actorClerkId: string): Promise<string> {
  const ext = PHOTO_EXTS[contentType];
  if (!ext) throw new Error('Photo must be JPEG, PNG, or WebP.');
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Photo must be under 5MB.');
  const path = `staff/${staffId}.${ext}`;
  await uploadFile('staff-photos', path, bytes, { contentType, upsert: true });
  // Same path per extension; clean up a stale copy under a different extension.
  const others = Object.values(PHOTO_EXTS).filter((e) => e !== ext).map((e) => `staff/${staffId}.${e}`);
  await deleteFile('staff-photos', others).catch(() => undefined);
  const url = `${getPublicUrl('staff-photos', path)}?v=${Date.now()}`;
  const { error } = await supabaseAdmin().from('staff').update({ photo_url: url }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.photo-set', target: `staff:${staffId}` });
  return url;
}

export async function removeStaffPhoto(staffId: number, actorClerkId: string): Promise<void> {
  const paths = Object.values(PHOTO_EXTS).map((e) => `staff/${staffId}.${e}`);
  await deleteFile('staff-photos', paths).catch(() => undefined);
  const { error } = await supabaseAdmin().from('staff').update({ photo_url: null }).eq('id', staffId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.photo-removed', target: `staff:${staffId}` });
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

  const { data: assigns } = await db.from('staff_assignments').select('id, program_id, active').eq('staff_id', staffId);
  let hasCurrent = false;
  for (const a of assigns ?? []) {
    if (!a.active) continue; // replaced-for-remainder assignments don't count as current work
    const { data: sess } = await db.from('program_sessions').select('ends_at').eq('program_id', a.program_id).order('ends_at', { ascending: false }).limit(1).maybeSingle();
    if (!sess || sess.ends_at.slice(0, 10) >= today) { hasCurrent = true; break; } // upcoming/ongoing (or no sessions yet)
  }

  // Outstanding pay counts across ALL assignments, incl. closed ones - a
  // replaced coach stays active until they're paid for the portion worked.
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

/** Program run window + session count, from its generated sessions. */
export async function programRun(programId: number): Promise<{ startISO: string | null; endISO: string | null; sessions: number }> {
  const { data } = await supabaseAdmin().from('program_sessions').select('starts_at, ends_at').eq('program_id', programId).order('starts_at');
  const rows = data ?? [];
  if (!rows.length) return { startISO: null, endISO: null, sessions: 0 };
  return { startISO: torontoDate(rows[0].starts_at), endISO: torontoDate(rows[rows.length - 1].ends_at), sessions: rows.length };
}

export async function assignStaffToProgram(input: { staffId: number; programId: number; roleLabel?: string | null; payMode: PayMode; rateCents: number; frequency: PayFrequency; units?: number; showPublic?: boolean; programStartISO?: string | null; programEndISO?: string | null }, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();

  // Volunteers are never paid - a volunteer assignment must be $0.
  if (input.rateCents > 0) {
    const { data: person } = await db.from('staff').select('employment, first_name').eq('id', input.staffId).single();
    if (person?.employment === 'volunteer') {
      throw new Error(`${person.first_name} is classified as a volunteer (no pay) - assign at $0 or change their classification first.`);
    }
  }

  // The run window and default units come from the program's own sessions;
  // explicit dates are only needed for a program with no sessions yet.
  const run = await programRun(input.programId);
  const startISO = input.programStartISO || run.startISO;
  const endISO = input.programEndISO || run.endISO;
  if (!startISO || !endISO) throw new Error('This program has no sessions yet - enter the start and end dates.');
  const units = input.units ?? (input.payMode === 'per_session' ? run.sessions : undefined);
  if ((input.payMode === 'per_session' || input.payMode === 'hourly') && !units) {
    throw new Error(input.payMode === 'hourly' ? 'Enter the total hours for an hourly assignment.' : 'This program has no sessions yet - enter the session count as units.');
  }

  const { data, error } = await db
    .from('staff_assignments')
    .insert({ staff_id: input.staffId, program_id: input.programId, role_label: input.roleLabel ?? null, pay_mode: input.payMode, rate_cents: input.rateCents, frequency: input.frequency, show_public: input.showPublic ?? true, starts_on: startISO })
    .select('id')
    .single();
  if (error) throw new Error(error.message.includes('duplicate') ? 'Already assigned to this program.' : `assign failed: ${error.message}`);
  const assignmentId = data.id as number;

  // Generate the pay schedule.
  const schedule = generatePaySchedule({ mode: input.payMode, rateCents: input.rateCents, frequency: input.frequency, programStartISO: startISO, programEndISO: endISO, units });
  if (schedule.length) {
    const { error: pErr } = await db.from('staff_pay_dates').insert(schedule.map((p) => ({ assignment_id: assignmentId, due_date: p.dueDate, amount_cents: p.amountCents })));
    if (pErr) throw new Error(`pay schedule failed: ${pErr.message}`);
  }
  await audit({ actorId: actorClerkId, action: 'staff.assigned', target: `staff:${input.staffId}`, meta: { program_id: input.programId, pay_mode: input.payMode, rate: input.rateCents, payDates: schedule.length } });
  await refreshStaffStatus(input.staffId);
  return assignmentId;
}

/**
 * Reduce an assignment's OUTSTANDING pay dates by `cents`, preferring the
 * pay date covering the session (first due on/after it), then walking
 * forward, then backward. Already-paid rows are never touched.
 */
async function reduceOutstandingPay(assignmentId: number, sessionDateISO: string, cents: number): Promise<number> {
  const db = supabaseAdmin();
  const { data: rows } = await db.from('staff_pay_dates').select('id, due_date, amount_cents').eq('assignment_id', assignmentId).eq('status', 'outstanding').order('due_date');
  const after = (rows ?? []).filter((r) => r.due_date >= sessionDateISO);
  const before = (rows ?? []).filter((r) => r.due_date < sessionDateISO).reverse();
  let remaining = cents;
  for (const row of [...after, ...before]) {
    if (remaining <= 0) break;
    const cut = Math.min(row.amount_cents, remaining);
    if (cut > 0) {
      const { error } = await db.from('staff_pay_dates').update({ amount_cents: row.amount_cents - cut }).eq('id', row.id);
      if (error) throw new Error(error.message);
      remaining -= cut;
    }
  }
  return cents - remaining; // actually deducted
}

/** Find the staff's assignment on a program, or create a hidden substitute one. */
async function getOrCreateSubAssignment(staffId: number, programId: number, rateCents: number, sessionDateISO: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from('staff_assignments').select('id').eq('staff_id', staffId).eq('program_id', programId).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db
    .from('staff_assignments')
    .insert({ staff_id: staffId, program_id: programId, role_label: 'Substitute', pay_mode: 'per_session', rate_cents: rateCents, frequency: 'after_program', show_public: false, starts_on: sessionDateISO })
    .select('id')
    .single();
  if (error) throw new Error(`substitute assignment failed: ${error.message}`);
  return data.id;
}

/**
 * Mark a session absent + record a replacement at an entered rate.
 * Per the spec, this MOVES the money: the original's pay for that session is
 * deducted from their outstanding pay dates (per_session/hourly), and the
 * replacement's pay is added at the entered rate under a (possibly hidden
 * substitute) assignment of their own. An ad-hoc replacement can be created
 * by name (account-less staff record). Re-recording the same session is a
 * no-op so the money never double-moves.
 */
export async function recordAbsence(
  input: { assignmentId: number; sessionDateISO: string; replacementStaffId?: number | null; replacementName?: string | null; replacementRateCents?: number | null },
  actorClerkId: string,
): Promise<{ adjusted: boolean; deductedCents: number; replacementStaffId: number | null }> {
  const db = supabaseAdmin();
  const { data: a } = await db.from('staff_assignments').select('id, staff_id, program_id, pay_mode, rate_cents').eq('id', input.assignmentId).single();
  if (!a) throw new Error('Assignment not found.');

  const { data: dupe } = await db.from('staff_session_absences').select('id').eq('assignment_id', input.assignmentId).eq('session_date', input.sessionDateISO).maybeSingle();
  if (dupe) return { adjusted: false, deductedCents: 0, replacementStaffId: null };

  // Resolve or ad-hoc-create the replacement.
  let replacementStaffId = input.replacementStaffId ?? null;
  if (!replacementStaffId && input.replacementName?.trim()) {
    const parts = input.replacementName.trim().split(/\s+/);
    const created = await createStaff({ firstName: parts[0], lastName: parts.slice(1).join(' ') || '-' }, actorClerkId);
    replacementStaffId = created.id;
  }

  const { error } = await db.from('staff_session_absences').insert({
    assignment_id: input.assignmentId,
    session_date: input.sessionDateISO,
    replacement_staff_id: replacementStaffId,
    replacement_rate_cents: input.replacementRateCents ?? null,
    created_by: actorClerkId,
  });
  if (error) throw new Error(error.message);

  // Remove the original's pay for the missed session (rate-per-unit modes only;
  // flat/salary pay is not per-session and stays put, as in recomputeWithAbsences).
  let deducted = 0;
  if (a.pay_mode === 'per_session' || a.pay_mode === 'hourly') {
    deducted = await reduceOutstandingPay(a.id, input.sessionDateISO, a.rate_cents);
  }

  // Add the replacement's pay at the entered rate.
  if (replacementStaffId && (input.replacementRateCents ?? 0) > 0) {
    const subAssignmentId = await getOrCreateSubAssignment(replacementStaffId, a.program_id, input.replacementRateCents!, input.sessionDateISO);
    const { error: pErr } = await db.from('staff_pay_dates').insert({ assignment_id: subAssignmentId, due_date: input.sessionDateISO, amount_cents: input.replacementRateCents! });
    if (pErr) throw new Error(pErr.message);
    await refreshStaffStatus(replacementStaffId);
  }

  await audit({ actorId: actorClerkId, action: 'staff.absence-recorded', target: `staff_assignment:${input.assignmentId}`, meta: { session: input.sessionDateISO, replacement: replacementStaffId, deducted_cents: deducted, replacement_rate_cents: input.replacementRateCents ?? null } });
  await refreshStaffStatus(a.staff_id);
  return { adjusted: true, deductedCents: deducted, replacementStaffId };
}

/**
 * Change an existing assignment's rate from a date forward (a raise, or a
 * mis-entered rate). Paid pay dates are never touched: the outstanding
 * balance is recomputed as old-rate-for-the-portion-worked plus
 * new-rate-for-the-rest (absent sessions excluded on both sides), and the
 * outstanding schedule is re-cut over the remaining window on the
 * assignment's own frequency. Salary (amount per period) simply re-prices
 * the outstanding periods due on/after the date.
 */
export async function updateAssignmentRate(
  input: { assignmentId: number; newRateCents: number; fromDateISO?: string | null },
  actorClerkId: string,
): Promise<{ newOutstandingCents: number }> {
  const db = supabaseAdmin();
  const from = input.fromDateISO || torontoToday();
  if (input.newRateCents < 0) throw new Error('Rate must be positive.');
  const { data: a } = await db.from('staff_assignments').select('id, staff_id, program_id, pay_mode, rate_cents, frequency, active, starts_on').eq('id', input.assignmentId).single();
  if (!a) throw new Error('Assignment not found.');
  if (!a.active) throw new Error('This assignment was replaced - adjust the replacement instead.');

  const { data: payRows } = await db.from('staff_pay_dates').select('id, due_date, amount_cents, status').eq('assignment_id', a.id);
  const paidCents = (payRows ?? []).filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount_cents, 0);
  const outstandingIds = (payRows ?? []).filter((p) => p.status === 'outstanding').map((p) => p.id);

  let newOutstanding: number;
  if (a.pay_mode === 'salary') {
    // Re-price the periods from the date on; earlier periods stand as generated.
    const later = (payRows ?? []).filter((p) => p.status === 'outstanding' && p.due_date >= from);
    for (const row of later) {
      const { error } = await db.from('staff_pay_dates').update({ amount_cents: input.newRateCents }).eq('id', row.id);
      if (error) throw new Error(error.message);
    }
    newOutstanding = (payRows ?? []).filter((p) => p.status === 'outstanding' && p.due_date < from).reduce((s, p) => s + p.amount_cents, 0) + later.length * input.newRateCents;
  } else {
    // Only this assignment's own window counts: a replacement hired
    // mid-program (starts_on) is not owed for sessions before the handoff.
    const { data: sess } = await db.from('program_sessions').select('starts_at, ends_at').eq('program_id', a.program_id).order('starts_at');
    const sessions = (sess ?? []).filter((s) => !a.starts_on || torontoDate(s.starts_at) >= a.starts_on);
    const { data: absRows } = await db.from('staff_session_absences').select('session_date').eq('assignment_id', a.id);
    const absBefore = (absRows ?? []).filter((x) => x.session_date < from).length;
    const absAfter = (absRows ?? []).length - absBefore;
    const rawBefore = sessions.filter((s) => torontoDate(s.starts_at) < from).length;
    const rawAfter = sessions.length - rawBefore;
    const unitsBefore = Math.max(0, rawBefore - absBefore);
    const unitsAfter = Math.max(0, rawAfter - absAfter);

    let owedTotal: number;
    if (a.pay_mode === 'flat') {
      owedTotal = sessions.length
        ? Math.round((a.rate_cents * rawBefore) / sessions.length) + Math.round((input.newRateCents * rawAfter) / sessions.length)
        : input.newRateCents;
    } else {
      owedTotal = a.rate_cents * unitsBefore + input.newRateCents * unitsAfter;
    }
    newOutstanding = Math.max(0, owedTotal - paidCents);

    if (outstandingIds.length) {
      const { error } = await db.from('staff_pay_dates').delete().in('id', outstandingIds);
      if (error) throw new Error(error.message);
    }
    if (newOutstanding > 0) {
      const endISO = sessions.length ? torontoDate(sessions[sessions.length - 1].ends_at) : from;
      const windowEnd = endISO > from ? endISO : from;
      const schedule = a.frequency === 'after_program'
        ? [{ dueDate: windowEnd, amountCents: newOutstanding }]
        : generatePaySchedule({ mode: 'flat', rateCents: newOutstanding, frequency: a.frequency as PayFrequency, programStartISO: from, programEndISO: windowEnd });
      const { error } = await db.from('staff_pay_dates').insert(schedule.map((p) => ({ assignment_id: a.id, due_date: p.dueDate, amount_cents: p.amountCents })));
      if (error) throw new Error(error.message);
    }
  }

  const { error: rErr } = await db.from('staff_assignments').update({ rate_cents: input.newRateCents }).eq('id', a.id);
  if (rErr) throw new Error(rErr.message);
  await audit({ actorId: actorClerkId, action: 'staff.rate-changed', target: `staff_assignment:${a.id}`, meta: { from, old_rate_cents: a.rate_cents, new_rate_cents: input.newRateCents, new_outstanding_cents: newOutstanding } });
  await refreshStaffStatus(a.staff_id);
  return { newOutstandingCents: newOutstanding };
}

/**
 * Remove a mistaken assignment outright. Refused once anything has been
 * PAID on it - paid history must stay on the books; use replace-for-
 * remainder (or archive the staff member) instead.
 */
export async function removeAssignment(assignmentId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: a } = await db.from('staff_assignments').select('id, staff_id, program_id').eq('id', assignmentId).single();
  if (!a) throw new Error('Assignment not found.');
  const { count: paidCount } = await db.from('staff_pay_dates').select('id', { count: 'exact', head: true }).eq('assignment_id', assignmentId).eq('status', 'paid');
  if ((paidCount ?? 0) > 0) throw new Error('This assignment has paid pay dates - that history must stay. Replace for the remainder instead.');
  const { error } = await db.from('staff_assignments').delete().eq('id', assignmentId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.assignment-removed', target: `staff_assignment:${assignmentId}`, meta: { staff_id: a.staff_id, program_id: a.program_id } });
  await refreshStaffStatus(a.staff_id);
}

/**
 * Replace a staff member for the REMAINDER of a program from a date onward,
 * at a new (customizable) rate. The original assignment is closed
 * (active=false, effective_until) and their outstanding pay is re-cut to what
 * they are owed for the portion worked; the replacement gets their own
 * assignment + generated pay schedule over the remaining window.
 */
export async function replaceForRemainder(
  input: { assignmentId: number; fromDateISO: string; replacementStaffId?: number | null; replacementName?: string | null; newRateCents: number },
  actorClerkId: string,
): Promise<{ replacementAssignmentId: number; originalFinalOutstandingCents: number }> {
  const db = supabaseAdmin();
  const { data: a } = await db.from('staff_assignments').select('id, staff_id, program_id, role_label, pay_mode, rate_cents, frequency, show_public, active, starts_on').eq('id', input.assignmentId).single();
  if (!a) throw new Error('Assignment not found.');
  if (!a.active) throw new Error('This assignment was already replaced.');

  let replacementStaffId = input.replacementStaffId ?? null;
  if (!replacementStaffId && input.replacementName?.trim()) {
    const parts = input.replacementName.trim().split(/\s+/);
    const created = await createStaff({ firstName: parts[0], lastName: parts.slice(1).join(' ') || '-' }, actorClerkId);
    replacementStaffId = created.id;
  }
  if (!replacementStaffId) throw new Error('Pick a replacement or enter a name.');
  if (replacementStaffId === a.staff_id) throw new Error('The replacement must be a different person.');

  // Split the program's sessions at the handoff date, within THIS
  // assignment's own window (starts_on - the original may themselves have
  // been a mid-program replacement). Sessions the original was already
  // marked absent from don't count as worked - that pay moved to the
  // per-session substitute when the absence was recorded.
  const { data: sess } = await db.from('program_sessions').select('starts_at, ends_at').eq('program_id', a.program_id).order('starts_at');
  const sessions = (sess ?? []).filter((s) => !a.starts_on || torontoDate(s.starts_at) >= a.starts_on);
  const { count: absencesBefore } = await db.from('staff_session_absences').select('id', { count: 'exact', head: true }).eq('assignment_id', a.id).lt('session_date', input.fromDateISO);
  const unitsBefore = Math.max(0, sessions.filter((s) => torontoDate(s.starts_at) < input.fromDateISO).length - (absencesBefore ?? 0));
  const unitsAfter = sessions.filter((s) => torontoDate(s.starts_at) >= input.fromDateISO).length;
  const endISO = sessions.length ? torontoDate(sessions[sessions.length - 1].ends_at) : null;

  // Re-cut the original's pay: paid rows stand; outstanding rows are replaced
  // by one final amount = owed-for-portion-worked minus what's already paid.
  const { data: payRows } = await db.from('staff_pay_dates').select('id, due_date, amount_cents, status').eq('assignment_id', a.id);
  const paidCents = (payRows ?? []).filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount_cents, 0);
  const outstandingBefore = (payRows ?? []).filter((p) => p.status === 'outstanding' && p.due_date < input.fromDateISO).reduce((s, p) => s + p.amount_cents, 0);
  const owedTotal = originalOwedAfterReplacement({ mode: a.pay_mode as PayMode, rateCents: a.rate_cents, totalUnits: sessions.length, unitsBefore, salaryOwedCents: paidCents + outstandingBefore });
  const finalOutstanding = Math.max(0, owedTotal - paidCents);

  const outstandingIds = (payRows ?? []).filter((p) => p.status === 'outstanding').map((p) => p.id);
  if (outstandingIds.length) {
    const { error } = await db.from('staff_pay_dates').delete().in('id', outstandingIds);
    if (error) throw new Error(error.message);
  }
  if (finalOutstanding > 0) {
    const { error } = await db.from('staff_pay_dates').insert({ assignment_id: a.id, due_date: input.fromDateISO, amount_cents: finalOutstanding });
    if (error) throw new Error(error.message);
  }
  const { error: closeErr } = await db.from('staff_assignments').update({ active: false, effective_until: input.fromDateISO }).eq('id', a.id);
  if (closeErr) throw new Error(closeErr.message);

  // The replacement takes over the same role at the NEW rate for the rest.
  const { data: existing } = await db.from('staff_assignments').select('id').eq('staff_id', replacementStaffId).eq('program_id', a.program_id).maybeSingle();
  if (existing) throw new Error('The replacement already has an assignment on this program - adjust theirs instead.');
  const { data: repl, error: rErr } = await db
    .from('staff_assignments')
    .insert({ staff_id: replacementStaffId, program_id: a.program_id, role_label: a.role_label, pay_mode: a.pay_mode, rate_cents: input.newRateCents, frequency: a.frequency, show_public: a.show_public, starts_on: input.fromDateISO })
    .select('id')
    .single();
  if (rErr) throw new Error(rErr.message);

  const schedule = generatePaySchedule({
    mode: a.pay_mode as PayMode,
    rateCents: input.newRateCents,
    frequency: a.frequency as PayFrequency,
    programStartISO: input.fromDateISO,
    programEndISO: endISO && endISO > input.fromDateISO ? endISO : input.fromDateISO,
    units: unitsAfter,
  });
  if (schedule.length) {
    const { error } = await db.from('staff_pay_dates').insert(schedule.map((p) => ({ assignment_id: repl.id, due_date: p.dueDate, amount_cents: p.amountCents })));
    if (error) throw new Error(error.message);
  }

  await audit({ actorId: actorClerkId, action: 'staff.replaced-for-remainder', target: `staff_assignment:${a.id}`, meta: { from: input.fromDateISO, replacement_staff_id: replacementStaffId, new_rate_cents: input.newRateCents, original_final_outstanding_cents: finalOutstanding, units_before: unitsBefore, units_after: unitsAfter } });
  await refreshStaffStatus(a.staff_id);
  await refreshStaffStatus(replacementStaffId);
  return { replacementAssignmentId: repl.id, originalFinalOutstandingCents: finalOutstanding };
}

/** Original + replacement owed for an assignment after absences (per-session). */
export async function payBreakdown(assignmentId: number, totalUnits: number): Promise<{ originalCents: number; replacementCents: number }> {
  const db = supabaseAdmin();
  const { data: a } = await db.from('staff_assignments').select('pay_mode, rate_cents').eq('id', assignmentId).single();
  const { data: abs } = await db.from('staff_session_absences').select('replacement_rate_cents').eq('assignment_id', assignmentId);
  return recomputeWithAbsences({ mode: a!.pay_mode as PayMode, originalRateCents: a!.rate_cents, totalUnits, absences: (abs ?? []).map((x) => ({ replacementRateCents: x.replacement_rate_cents ?? 0 })) });
}

/**
 * Mark a pay date paid (tracking only - money moves in payroll/QuickBooks).
 * Refreshes the staff's derived status: outstanding pay is what keeps a
 * between-programs coach 'active', so settling the last one flips them.
 */
export async function markPayDatePaid(payDateId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('staff_pay_dates')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', payDateId)
    .select('amount_cents, staff_assignments(staff_id)')
    .single();
  if (error) throw new Error(error.message);
  const staffId = (data.staff_assignments as unknown as { staff_id: number } | null)?.staff_id;
  await audit({ actorId: actorClerkId, action: 'staff.pay-marked-paid', target: `staff_pay_date:${payDateId}`, meta: { amount_cents: data.amount_cents } });
  if (staffId) await refreshStaffStatus(staffId);
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

export async function deleteCertification(certId: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_certifications').delete().eq('id', certId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'staff.cert-removed', target: `staff_certification:${certId}` });
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

export async function removeUnavailability(staffId: number, dateISO: string): Promise<void> {
  const { error } = await supabaseAdmin().from('staff_unavailability').delete().eq('staff_id', staffId).eq('date', dateISO);
  if (error) throw new Error(error.message);
}

/** Upcoming submitted unavailability, org-wide (admin surfacing - informs manual decisions, never auto-reassigns). */
export async function upcomingUnavailability(): Promise<Array<{ staff_id: number; date: string; note: string | null; name: string }>> {
  const { data } = await supabaseAdmin()
    .from('staff_unavailability')
    .select('staff_id, date, note, staff(first_name, last_name)')
    .gte('date', torontoToday())
    .order('date');
  return (data ?? []).map((r) => {
    const s = r.staff as unknown as { first_name: string; last_name: string };
    return { staff_id: r.staff_id, date: r.date, note: r.note, name: `${s.first_name} ${s.last_name}` };
  });
}

// --- Staff self-view (play side) ---------------------------------------------

export async function staffForProfile(profileId: number): Promise<Staff | null> {
  const { data } = await supabaseAdmin().from('staff').select(S_COLS).eq('profile_id', profileId).maybeSingle();
  return (data as Staff | null) ?? null;
}

export interface SelfViewProgram {
  programId: number;
  programName: string;
  roleLabel: string | null;
  assignmentId: number;
  /** Next sessions, Toronto-labelled by the page. */
  sessions: Array<{ startsAt: string; endsAt: string }>;
  /** Roster names; empty when roster_names is not granted. */
  roster: Array<{ name: string; dob: string | null; answers: Array<{ label: string; answer: string }> }>;
  rosterHidden: boolean;
}

/**
 * Everything a staff member's own read-only view needs, capability-gated:
 * roster names behind roster_names, DOB + custom-question answers behind
 * roster_sensitive (the PIPEDA-critical toggle), schedule behind schedule.
 */
export async function staffSelfView(staff: Staff, opts?: { capsOverride?: Record<string, ResolvedCapability> }): Promise<{
  caps: Record<string, ResolvedCapability>;
  programs: SelfViewProgram[];
  pay: Array<{ dueDate: string; amountCents: number; status: string; programName: string }>;
  unavailability: Array<{ date: string; note: string | null }>;
}> {
  const db = supabaseAdmin();
  const caps = opts?.capsOverride ?? (staff.profile_id ? await capabilitiesForProfile(staff.profile_id) : {});
  const showSchedule = can(caps, 'schedule');
  const showNames = can(caps, 'roster_names');
  const showSensitive = can(caps, 'roster_sensitive');

  const { data: assigns } = await db
    .from('staff_assignments')
    .select('id, program_id, role_label, active, programs(name)')
    .eq('staff_id', staff.id)
    .eq('active', true);

  const nowISO = new Date().toISOString();
  const programs: SelfViewProgram[] = [];
  for (const a of assigns ?? []) {
    const programName = (a.programs as unknown as { name: string } | null)?.name ?? `Program ${a.program_id}`;

    let sessions: SelfViewProgram['sessions'] = [];
    if (showSchedule) {
      const { data: sess } = await db.from('program_sessions').select('starts_at, ends_at').eq('program_id', a.program_id).gte('starts_at', nowISO).order('starts_at').limit(12);
      sessions = (sess ?? []).map((s) => ({ startsAt: s.starts_at, endsAt: s.ends_at }));
    }

    let roster: SelfViewProgram['roster'] = [];
    if (showNames) {
      const { data: regs } = await db
        .from('registrations')
        .select('id, family_members(first_name, last_name, dob)')
        .eq('program_id', a.program_id)
        .in('status', ['active', 'waitlisted']);
      roster = await Promise.all(
        (regs ?? []).map(async (r) => {
          const m = r.family_members as unknown as { first_name: string; last_name: string; dob: string | null } | null;
          let answers: Array<{ label: string; answer: string }> = [];
          if (showSensitive) {
            const { data: qa } = await db.from('question_answers').select('answer, questions(label)').eq('registration_id', r.id);
            answers = (qa ?? []).map((q) => ({
              label: (q.questions as unknown as { label: string } | null)?.label ?? 'Answer',
              answer: Array.isArray(q.answer) ? (q.answer as string[]).join(', ') : String(q.answer),
            }));
          }
          return { name: m ? `${m.first_name} ${m.last_name}` : 'Registrant', dob: showSensitive ? (m?.dob ?? null) : null, answers };
        }),
      );
      roster.sort((x, y) => x.name.localeCompare(y.name));
    }

    programs.push({ programId: a.program_id, programName, roleLabel: a.role_label, assignmentId: a.id, sessions, roster, rosterHidden: !showNames });
  }

  const assignIds = (assigns ?? []).map((a) => a.id);
  let pay: Array<{ dueDate: string; amountCents: number; status: string; programName: string }> = [];
  if (assignIds.length) {
    const { data: payRows } = await db.from('staff_pay_dates').select('due_date, amount_cents, status, staff_assignments(programs(name))').in('assignment_id', assignIds).order('due_date');
    pay = (payRows ?? []).map((p) => ({
      dueDate: p.due_date,
      amountCents: p.amount_cents,
      status: p.status,
      programName: (p.staff_assignments as unknown as { programs: { name: string } | null } | null)?.programs?.name ?? '',
    }));
  }

  const { data: unav } = await db.from('staff_unavailability').select('date, note').eq('staff_id', staff.id).gte('date', torontoToday()).order('date');
  return { caps, programs, pay, unavailability: unav ?? [] };
}

// --- Ratings (from Module 15 feedback) ----------------------------------------

/**
 * Star ratings per staff member, aggregated from Module 15 program feedback.
 * A response rates the program experience, so it counts for every coach who
 * PUBLICLY delivered it (show_public assignments; hidden substitutes are
 * excluded). Reviews are collected and coordinated by the Feedback module -
 * this is a read-only rollup.
 */
export async function staffRatings(staffIds: number[]): Promise<Map<number, { avg: number; count: number }>> {
  const out = new Map<number, { avg: number; count: number }>();
  if (!staffIds.length) return out;
  const db = supabaseAdmin();
  const { data: assigns } = await db.from('staff_assignments').select('staff_id, program_id').in('staff_id', staffIds).eq('show_public', true);
  const programIds = [...new Set((assigns ?? []).map((a) => a.program_id))];
  if (!programIds.length) return out;
  const { data: responses } = await db.from('feedback_responses').select('program_id, rating').in('program_id', programIds).not('rating', 'is', null);
  const byProgram = new Map<number, number[]>();
  for (const r of responses ?? []) {
    const list = byProgram.get(r.program_id) ?? [];
    list.push(r.rating!);
    byProgram.set(r.program_id, list);
  }
  const pooled = new Map<number, number[]>();
  for (const a of assigns ?? []) {
    const ratings = byProgram.get(a.program_id);
    if (!ratings?.length) continue;
    pooled.set(a.staff_id, [...(pooled.get(a.staff_id) ?? []), ...ratings]);
  }
  for (const [staffId, ratings] of pooled) {
    out.set(staffId, { avg: Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10, count: ratings.length });
  }
  return out;
}

// --- Tenure stats --------------------------------------------------------------

/** '2026:may-aug' -> a comparable index (3 seasons per year, in calendar order). */
function seasonIndex(seasonKey: string): number | null {
  const m = seasonKey.match(/^(\d{4}):(jan-apr|may-aug|sep-dec)$/);
  if (!m) return null;
  return Number(m[1]) * 3 + ['jan-apr', 'may-aug', 'sep-dec'].indexOf(m[2]);
}

export interface StaffStats {
  /** Earliest assignment start (starts_on, falling back to when it was recorded). */
  startDate: string | null;
  /** Distinct seasons they've worked (from their programs' season keys). */
  totalSeasons: number;
  /** Consecutive-season run counting back from their most recent season. */
  consecutiveSeasons: number;
}

export async function staffStats(staffIds: number[]): Promise<Map<number, StaffStats>> {
  const out = new Map<number, StaffStats>();
  if (!staffIds.length) return out;
  const { data: assigns } = await supabaseAdmin()
    .from('staff_assignments')
    .select('staff_id, starts_on, created_at, programs(season_key)')
    .in('staff_id', staffIds);

  const byStaff = new Map<number, { starts: string[]; seasons: Set<number> }>();
  for (const a of assigns ?? []) {
    const cur = byStaff.get(a.staff_id) ?? { starts: [], seasons: new Set<number>() };
    cur.starts.push(a.starts_on ?? a.created_at.slice(0, 10));
    const key = (a.programs as unknown as { season_key: string | null } | null)?.season_key;
    const idx = key ? seasonIndex(key) : null;
    if (idx !== null) cur.seasons.add(idx);
    byStaff.set(a.staff_id, cur);
  }
  for (const [staffId, v] of byStaff) {
    let streak = 0;
    if (v.seasons.size) {
      let at = Math.max(...v.seasons);
      while (v.seasons.has(at)) { streak++; at--; }
    }
    out.set(staffId, { startDate: v.starts.sort()[0] ?? null, totalSeasons: v.seasons.size, consecutiveSeasons: streak });
  }
  return out;
}

/**
 * One coach's review log: the compiled star rating plus every piece of TYPED
 * feedback from their public programs, newest first. Read-only view over
 * Module 15 responses.
 */
export async function staffReviewLog(staffId: number): Promise<{
  avg: number | null;
  count: number;
  entries: Array<{ programName: string; rating: number; comment: string; submittedAt: string | null }>;
}> {
  const db = supabaseAdmin();
  const { data: assigns } = await db.from('staff_assignments').select('program_id').eq('staff_id', staffId).eq('show_public', true);
  const programIds = [...new Set((assigns ?? []).map((a) => a.program_id))];
  if (!programIds.length) return { avg: null, count: 0, entries: [] };
  const { data: responses } = await db
    .from('feedback_responses')
    .select('rating, comment, submitted_at, programs(name)')
    .in('program_id', programIds)
    .not('rating', 'is', null)
    .order('submitted_at', { ascending: false });
  const all = responses ?? [];
  const avg = all.length ? Math.round((all.reduce((s, r) => s + r.rating!, 0) / all.length) * 10) / 10 : null;
  const entries = all
    .filter((r) => r.comment?.trim())
    .map((r) => ({
      programName: (r.programs as unknown as { name: string } | null)?.name ?? '—',
      rating: r.rating!,
      comment: r.comment!.trim(),
      submittedAt: r.submitted_at,
    }));
  return { avg, count: all.length, entries };
}

// --- Re-registration rate ------------------------------------------------------

/**
 * Per-coach retention: of the players a coach coached in COMPLETED seasons,
 * how many registered for anything again in a later season? Builds over time -
 * programs in the current/future season aren't eligible yet (their players
 * haven't had a chance to re-register), so a new coach shows a dash until
 * their first season closes out.
 */
export async function staffReregistrationRates(staffIds: number[]): Promise<Map<number, { rate: number; eligible: number; returned: number }>> {
  const out = new Map<number, { rate: number; eligible: number; returned: number }>();
  if (!staffIds.length) return out;
  const db = supabaseAdmin();
  const season = currentSeason();
  const nowIdx = seasonIndex(`${season.year}:${season.key}`)!;

  const { data: assigns } = await db.from('staff_assignments').select('staff_id, program_id, programs(season_key)').in('staff_id', staffIds).eq('show_public', true);
  // Programs from completed seasons only, with their season index.
  const pastPrograms = new Map<number, number>(); // program_id -> season idx
  for (const a of assigns ?? []) {
    const key = (a.programs as unknown as { season_key: string | null } | null)?.season_key;
    const idx = key ? seasonIndex(key) : null;
    if (idx !== null && idx < nowIdx) pastPrograms.set(a.program_id, idx);
  }
  if (!pastPrograms.size) return out;

  const { data: regs } = await db.from('registrations').select('program_id, family_member_id').in('program_id', [...pastPrograms.keys()]).eq('status', 'active').not('family_member_id', 'is', null);
  const memberIds = [...new Set((regs ?? []).map((r) => r.family_member_id as number))];
  if (!memberIds.length) return out;

  // Every season each member has ANY active registration in, org-wide.
  const { data: allRegs } = await db.from('registrations').select('family_member_id, programs(season_key)').in('family_member_id', memberIds).eq('status', 'active');
  const seasonsByMember = new Map<number, Set<number>>();
  for (const r of allRegs ?? []) {
    const key = (r.programs as unknown as { season_key: string | null } | null)?.season_key;
    const idx = key ? seasonIndex(key) : null;
    if (idx === null) continue;
    const set = seasonsByMember.get(r.family_member_id as number) ?? new Set<number>();
    set.add(idx);
    seasonsByMember.set(r.family_member_id as number, set);
  }

  // A coached (member, program) pair counts as returned if the member has a
  // registration in ANY season after that program's.
  const regsByProgram = new Map<number, number[]>();
  for (const r of regs ?? []) regsByProgram.set(r.program_id, [...(regsByProgram.get(r.program_id) ?? []), r.family_member_id as number]);
  for (const a of assigns ?? []) {
    const progIdx = pastPrograms.get(a.program_id);
    if (progIdx === undefined) continue;
    const members = regsByProgram.get(a.program_id) ?? [];
    const cur = out.get(a.staff_id) ?? { rate: 0, eligible: 0, returned: 0 };
    for (const m of members) {
      cur.eligible++;
      const seasons = seasonsByMember.get(m);
      if (seasons && [...seasons].some((idx) => idx > progIdx)) cur.returned++;
    }
    out.set(a.staff_id, cur);
  }
  for (const [id, v] of out) {
    if (!v.eligible) out.delete(id);
    else out.set(id, { ...v, rate: Math.round((v.returned / v.eligible) * 100) });
  }
  return out;
}

// --- Pay reporting + QuickBooks export ---------------------------------------

export interface PayReportRow {
  id: number;
  dueDate: string;
  amountCents: number;
  status: 'outstanding' | 'paid';
  paidAt: string | null;
  staffId: number;
  staffName: string;
  staffEmail: string | null;
  employment: StaffEmployment | null;
  programId: number;
  programName: string;
  quickbooksClass: string | null;
}

export async function payRows(filter?: { fromISO?: string; toISO?: string }): Promise<PayReportRow[]> {
  let q = supabaseAdmin()
    .from('staff_pay_dates')
    .select('id, due_date, amount_cents, status, paid_at, staff_assignments(program_id, staff(id, first_name, last_name, email, employment), programs(id, name, quickbooks_class))')
    .order('due_date');
  if (filter?.fromISO) q = q.gte('due_date', filter.fromISO);
  if (filter?.toISO) q = q.lte('due_date', filter.toISO);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const a = r.staff_assignments as unknown as {
      program_id: number;
      staff: { id: number; first_name: string; last_name: string; email: string | null; employment: StaffEmployment | null } | null;
      programs: { id: number; name: string; quickbooks_class: string | null } | null;
    } | null;
    return {
      id: r.id,
      dueDate: r.due_date,
      amountCents: r.amount_cents,
      status: r.status as 'outstanding' | 'paid',
      paidAt: r.paid_at,
      staffId: a?.staff?.id ?? 0,
      staffName: a?.staff ? `${a.staff.first_name} ${a.staff.last_name}` : '-',
      staffEmail: a?.staff?.email ?? null,
      employment: a?.staff?.employment ?? null,
      programId: a?.programs?.id ?? a?.program_id ?? 0,
      programName: a?.programs?.name ?? '-',
      quickbooksClass: a?.programs?.quickbooks_class ?? null,
    };
  });
}

const csvCell = (v: string | number | null) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * QuickBooks payout export (documented in docs/staff-pay.md): one row per pay
 * date in the window. Tracking only - importing this into QuickBooks/payroll
 * is where money actually moves.
 */
export function qbPayoutCsv(rows: PayReportRow[]): string {
  const header = 'DueDate,Staff,Email,Classification,Program,QuickBooksClass,AmountCAD,Status,PaidAt';
  const lines = rows.map((r) =>
    [r.dueDate, r.staffName, r.staffEmail ?? '', r.employment ?? '', r.programName, r.quickbooksClass ?? '', (r.amountCents / 100).toFixed(2), r.status, r.paidAt ? r.paidAt.slice(0, 10) : '']
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\n');
}
