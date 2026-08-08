import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  addCertification,
  addStaffEmail,
  archiveStaff,
  assignStaffToProgram,
  createStaff,
  markPayDatePaid,
  payBreakdown,
  payRows,
  processCertExpiries,
  profileCan,
  programStaffCostCents,
  qbPayoutCsv,
  recordAbsence,
  refreshStaffStatus,
  removeAssignment,
  replaceForRemainder,
  setCapability,
  submitUnavailability,
  upcomingUnavailability,
  updateAssignmentRate,
} from '@/lib/staff/staff';

/**
 * DEV-ONLY: Module 5 end to end - account-less staff, email->profile linking,
 * capability matrix (incl. sensitive-fields gate), assignment with pay window
 * auto-derived from program sessions, absence MOVING pay to the substitute,
 * replace-for-remainder re-cutting both schedules, outstanding-pay-keeps-
 * active status, unavailability, QuickBooks CSV, cert expiry warn, program
 * staff-cost feed. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const staffIds: number[] = [];
  let programId: number | null = null;
  let profileId: number | null = null;

  try {
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Staff Verify League', programTypeId: league.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    // 6 sessions Sep-Nov: the assignment window + per-session units derive from these.
    await db.from('program_sessions').insert([
      { program_id: prog.id, starts_at: '2026-09-05T10:00:00-04:00', ends_at: '2026-09-05T12:00:00-04:00' },
      { program_id: prog.id, starts_at: '2026-09-19T10:00:00-04:00', ends_at: '2026-09-19T12:00:00-04:00' },
      { program_id: prog.id, starts_at: '2026-10-03T10:00:00-04:00', ends_at: '2026-10-03T12:00:00-04:00' },
      { program_id: prog.id, starts_at: '2026-10-17T10:00:00-04:00', ends_at: '2026-10-17T12:00:00-04:00' },
      { program_id: prog.id, starts_at: '2026-11-07T10:00:00-05:00', ends_at: '2026-11-07T12:00:00-05:00' },
      { program_id: prog.id, starts_at: '2026-11-28T10:00:00-05:00', ends_at: '2026-11-28T12:00:00-05:00' },
    ]);

    // 1. account-less coach
    const coach = await createStaff({ firstName: 'Ada', lastName: 'Coach' }, 'system:verify');
    staffIds.push(coach.id);
    record('account-less staff created (no profile)', coach.profile_id === null && coach.status === 'inactive', `status ${coach.status}`);

    // 2. capability matrix: coach role has roster_names view, NOT sensitive
    const stamp = Date.now();
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `st_${stamp}`, email: `st_${stamp}@example.test`, user_type: 'staff' }).select('id, email').single();
    profileId = prof!.id;
    const { data: coachRole } = await db.from('roles').select('id').eq('name', 'Coach').single();
    await db.from('role_assignments').insert({ profile_id: prof!.id, role_id: coachRole!.id, granted_by: 'system:verify' });
    record('coach can view roster names, NOT sensitive', (await profileCan(prof!.id, 'roster_names')) && !(await profileCan(prof!.id, 'roster_sensitive')), 'ok');

    await setCapability(coachRole!.id, 'roster_sensitive', true, false, 'system:verify');
    record('sensitive-fields grant flips access (matrix-driven)', await profileCan(prof!.id, 'roster_sensitive'), 'ok');
    await setCapability(coachRole!.id, 'roster_sensitive', false, false, 'system:verify'); // restore default

    // 3. email upgrade links an EXISTING profile immediately
    const { linkedProfileId } = await addStaffEmail(coach.id, prof!.email!, 'system:verify');
    record('adding a known email links the profile (login upgrade)', linkedProfileId === prof!.id, `linked ${linkedProfileId}`);

    // 4. assignment derives window + units from program sessions (none passed)
    const assignmentId = await assignStaffToProgram({ staffId: coach.id, programId: prog.id, roleLabel: 'Head Coach', payMode: 'per_session', rateCents: 5000, frequency: 'bi_weekly' }, 'system:verify');
    const { data: payDates } = await db.from('staff_pay_dates').select('amount_cents').eq('assignment_id', assignmentId);
    const sum = (payDates ?? []).reduce((a, p) => a + p.amount_cents, 0);
    record('assignment auto-derives window/units: 6 sessions x $50', (payDates ?? []).length >= 4 && sum === 6 * 5000, `${(payDates ?? []).length} pay dates, sum ${sum}`);

    // 5. status: assigned to upcoming program -> active
    record('status active when assigned to upcoming program', (await refreshStaffStatus(coach.id)) === 'active', 'ok');

    // 6. absence MOVES the money: coach loses the session, sub gains at entered rate
    const sub = await createStaff({ firstName: 'Ben', lastName: 'Sub' }, 'system:verify');
    staffIds.push(sub.id);
    const abs = await recordAbsence({ assignmentId, sessionDateISO: '2026-10-03', replacementStaffId: sub.id, replacementRateCents: 6000 }, 'system:verify');
    const coachOutstanding = async () => {
      const { data } = await db.from('staff_pay_dates').select('amount_cents, status').eq('assignment_id', assignmentId);
      return (data ?? []).filter((p) => p.status === 'outstanding').reduce((a, p) => a + p.amount_cents, 0);
    };
    const { data: subAssigns } = await db.from('staff_assignments').select('id, show_public').eq('staff_id', sub.id).eq('program_id', prog.id);
    const { data: subPay } = await db.from('staff_pay_dates').select('amount_cents, due_date').in('assignment_id', (subAssigns ?? []).map((x) => x.id));
    record(
      'absence moves pay: coach -$50, hidden sub +$60 on the date',
      abs.adjusted && abs.deductedCents === 5000 && (await coachOutstanding()) === 25000 && subPay?.length === 1 && subPay[0].amount_cents === 6000 && subPay[0].due_date === '2026-10-03' && subAssigns?.[0]?.show_public === false,
      `deducted ${abs.deductedCents}, coach now ${await coachOutstanding()}, sub ${JSON.stringify(subPay)}`,
    );

    // 7. same absence twice never double-moves
    const dupe = await recordAbsence({ assignmentId, sessionDateISO: '2026-10-03', replacementStaffId: sub.id, replacementRateCents: 6000 }, 'system:verify');
    record('duplicate absence is a no-op', !dupe.adjusted && (await coachOutstanding()) === 25000, `adjusted ${dupe.adjusted}`);

    // 8. display recompute agrees (5 worked x $50, 1 covered x $60)
    const bd = await payBreakdown(assignmentId, 6);
    record('absence recompute (orig 5x$50, sub 1x$60)', bd.originalCents === 25000 && bd.replacementCents === 6000, JSON.stringify(bd));

    // 9. replace for the remainder: 3 sessions left, new coach at $70
    const cara = await createStaff({ firstName: 'Cara', lastName: 'Relief' }, 'system:verify');
    staffIds.push(cara.id);
    const repl = await replaceForRemainder({ assignmentId, fromDateISO: '2026-10-15', replacementStaffId: cara.id, newRateCents: 7000 }, 'system:verify');
    const { data: closed } = await db.from('staff_assignments').select('active, effective_until').eq('id', assignmentId).single();
    const { data: caraPay } = await db.from('staff_pay_dates').select('amount_cents').eq('assignment_id', repl.replacementAssignmentId);
    const caraSum = (caraPay ?? []).reduce((a, p) => a + p.amount_cents, 0);
    // Worked sessions before Oct 15 = 3 minus the Oct 3 absence = 2 -> owed $100.
    record(
      'replace-for-remainder: original closed + re-cut to worked portion, replacement scheduled',
      !closed!.active && closed!.effective_until === '2026-10-15' && repl.originalFinalOutstandingCents === 10000 && caraSum === 3 * 7000,
      `active ${closed!.active}, final ${repl.originalFinalOutstandingCents}, cara sum ${caraSum}`,
    );

    // 10. program staff cost feeds margin: 10000 (coach) + 6000 (sub) + 21000 (cara)
    const cost = await programStaffCostCents(prog.id);
    record('program staff-cost feed reflects the whole handoff', cost === 37000, `cost ${cost}`);

    // 11. outstanding pay keeps a coach active until settled (their assignment is closed)
    record('outstanding pay keeps replaced coach active', (await refreshStaffStatus(coach.id)) === 'active', 'ok');
    const { data: finalRow } = await db.from('staff_pay_dates').select('id').eq('assignment_id', assignmentId).eq('status', 'outstanding').single();
    await markPayDatePaid(finalRow!.id, 'system:verify');
    const { data: afterPaid } = await db.from('staff').select('status').eq('id', coach.id).single();
    record('settling the last pay date flips them inactive', afterPaid!.status === 'inactive', afterPaid!.status);

    // 12. unavailability: self-submitted, surfaces to admin
    const unavDate = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    await submitUnavailability(cara.id, unavDate, 'family trip');
    const upcoming = await upcomingUnavailability();
    record('unavailability surfaces on the admin list', upcoming.some((u) => u.staff_id === cara.id && u.date === unavDate && u.note === 'family trip'), `${upcoming.length} upcoming`);

    // 13. QuickBooks payout CSV
    const rows = await payRows({ fromISO: '2026-09-01', toISO: '2026-12-31' });
    const mine = rows.filter((r) => r.programName === 'Staff Verify League');
    const csv = qbPayoutCsv(mine);
    record(
      'QuickBooks CSV: header + a row per pay date in window',
      csv.startsWith('DueDate,Staff,Email,Program,QuickBooksClass,AmountCAD,Status,PaidAt') && csv.includes('Staff Verify League') && csv.includes('70.00') && csv.split('\n').length === mine.length + 1,
      `${csv.split('\n').length - 1} rows`,
    );

    // 14. rate change mid-window: Cara $70 -> $80 from Nov 1. Her assignment
    // starts Oct 15 (replacement), so only Oct 17 counts as worked at the old
    // rate; Nov 7 + Nov 28 re-cut at the new one.
    const rate = await updateAssignmentRate({ assignmentId: repl.replacementAssignmentId, newRateCents: 8000, fromDateISO: '2026-11-01' }, 'system:verify');
    const { data: caraAfter } = await db.from('staff_pay_dates').select('amount_cents, status').eq('assignment_id', repl.replacementAssignmentId);
    const caraOutstanding = (caraAfter ?? []).filter((p) => p.status === 'outstanding').reduce((s, p) => s + p.amount_cents, 0);
    const { data: caraAssign } = await db.from('staff_assignments').select('rate_cents').eq('id', repl.replacementAssignmentId).single();
    record(
      'rate change honours the assignment window (1x$70 + 2x$80)',
      rate.newOutstandingCents === 23000 && caraOutstanding === 23000 && caraAssign!.rate_cents === 8000,
      `outstanding ${caraOutstanding}, rate ${caraAssign!.rate_cents}`,
    );

    // 15. remove-assignment guard: coach's assignment has PAID history
    let removeBlocked = false;
    try { await removeAssignment(assignmentId, 'system:verify'); } catch { removeBlocked = true; }
    record('remove refuses once anything was paid', removeBlocked, removeBlocked ? 'rejected as expected' : 'REMOVED PAID HISTORY');

    // 16. remove a mistaken assignment (nothing paid) cleans up fully
    const dara = await createStaff({ firstName: 'Dara', lastName: 'Mistake' }, 'system:verify');
    staffIds.push(dara.id);
    const wrongId = await assignStaffToProgram({ staffId: dara.id, programId: prog.id, payMode: 'flat', rateCents: 10000, frequency: 'after_program' }, 'system:verify');
    await removeAssignment(wrongId, 'system:verify');
    const { count: leftoverPay } = await db.from('staff_pay_dates').select('id', { count: 'exact', head: true }).eq('assignment_id', wrongId);
    const { data: daraAfter } = await db.from('staff').select('status').eq('id', dara.id).single();
    record('mistaken assignment removed, pay dates gone, status recomputed', (leftoverPay ?? 0) === 0 && daraAfter!.status === 'inactive', `leftover ${leftoverPay}, status ${daraAfter!.status}`);

    // 17. cert expiry warn-only (never blocks)
    await addCertification({ staffId: coach.id, name: 'Vulnerable Sector Check', expiresOn: new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10) }, 'system:verify');
    const warn = await processCertExpiries();
    record('cert expiry warns (warn-only)', warn.warned >= 1, `${warn.warned} warned`);

    // 15. archive retains history, removes from active
    await archiveStaff(coach.id, 'system:verify');
    const { data: archived } = await db.from('staff').select('status').eq('id', coach.id).single();
    record('archive is manual + retains record', archived!.status === 'archived', archived!.status);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (programId) {
      const { data: assigns } = await db.from('staff_assignments').select('id').eq('program_id', programId);
      const aIds = (assigns ?? []).map((a) => a.id);
      if (aIds.length) { await db.from('staff_pay_dates').delete().in('assignment_id', aIds); await db.from('staff_session_absences').delete().in('assignment_id', aIds); }
      await db.from('staff_assignments').delete().eq('program_id', programId);
      await db.from('program_sessions').delete().eq('program_id', programId);
      await db.from('programs').delete().eq('id', programId);
    }
    for (const sid of staffIds) { await db.from('staff_certifications').delete().eq('staff_id', sid); await db.from('staff_unavailability').delete().eq('staff_id', sid); await db.from('staff').delete().eq('id', sid); }
    if (profileId) await db.from('profiles').delete().eq('id', profileId);
    record('cleanup', true, 'staff, program, profile removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
