import 'server-only';
import {
  audit,
  can,
  generatePaySchedule,
  originalOwedAfterReplacement,
  recomputeWithAbsences,
  torontoDate,
  torontoToday,
  type PayFrequency,
  type PayMode,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { payRows } from '@/lib/staff/pay-report';
import { createStaff, refreshStaffStatus } from '@/lib/staff/records';

/**
 * Staff assignments + pay (Module 5): assign to a program, per-assignment pay
 * schedule, absences (pay moves to the substitute), replace-for-remainder,
 * mark pay dates paid, and the staff-cost feed for Module 4 margin. Pay is
 * TRACKED, never moved.
 */

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
