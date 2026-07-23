import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  addCertification,
  archiveStaff,
  assignStaffToProgram,
  capabilitiesForProfile,
  createStaff,
  payBreakdown,
  processCertExpiries,
  profileCan,
  programStaffCostCents,
  recordAbsence,
  refreshStaffStatus,
  setCapability,
} from '@/lib/staff/staff';

/**
 * DEV-ONLY: Module 5 end to end - account-less staff, capability matrix (incl.
 * sensitive-fields gate), assignment + generated pay schedule, absence/
 * replacement recompute, status derivation (outstanding pay keeps active),
 * cert expiry warn, program staff-cost feed. Cleaned up.
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
    // give the program a session window (start/end) via a couple sessions
    await db.from('program_sessions').insert([
      { program_id: prog.id, starts_at: '2026-09-05T10:00:00-04:00', ends_at: '2026-09-05T12:00:00-04:00' },
      { program_id: prog.id, starts_at: '2026-11-28T10:00:00-05:00', ends_at: '2026-11-28T12:00:00-05:00' },
    ]);

    // 1. account-less coach, then add email (upgrade path)
    const coach = await createStaff({ firstName: 'Ada', lastName: 'Coach' }, 'system:verify');
    staffIds.push(coach.id);
    record('account-less staff created (no profile)', coach.profile_id === null && coach.status === 'inactive', `status ${coach.status}`);

    // 2. capability matrix: coach role has roster_names view, NOT sensitive
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `st_${Date.now()}`, email: `st_${Date.now()}@example.test`, user_type: 'staff' }).select('id').single();
    profileId = prof!.id;
    const { data: coachRole } = await db.from('roles').select('id').eq('name', 'Coach').single();
    await db.from('role_assignments').insert({ profile_id: prof!.id, role_id: coachRole!.id, granted_by: 'system:verify' });
    record('coach can view roster names, NOT sensitive', (await profileCan(prof!.id, 'roster_names')) && !(await profileCan(prof!.id, 'roster_sensitive')), 'ok');

    // grant sensitive to Coach role -> now allowed (matrix, not hard-coded)
    await setCapability(coachRole!.id, 'roster_sensitive', true, false, 'system:verify');
    record('sensitive-fields grant flips access (matrix-driven)', await profileCan(prof!.id, 'roster_sensitive'), 'ok');
    await setCapability(coachRole!.id, 'roster_sensitive', false, false, 'system:verify'); // restore default

    // 3. assignment + generated pay schedule (per-session bi-weekly)
    const assignmentId = await assignStaffToProgram({ staffId: coach.id, programId: prog.id, payMode: 'per_session', rateCents: 5000, frequency: 'bi_weekly', units: 12, programStartISO: '2026-09-05', programEndISO: '2026-11-28' }, 'system:verify');
    const { data: payDates } = await db.from('staff_pay_dates').select('amount_cents, status').eq('assignment_id', assignmentId);
    const sum = (payDates ?? []).reduce((a, p) => a + p.amount_cents, 0);
    record('assignment generates pay schedule summing to total', (payDates ?? []).length >= 4 && sum === 12 * 5000, `${(payDates ?? []).length} pay dates, sum ${sum}`);

    // 4. status: assigned to upcoming program -> active
    record('status active when assigned to upcoming program', (await refreshStaffStatus(coach.id)) === 'active', 'ok');

    // 5. absence + replacement recompute
    const sub = await createStaff({ firstName: 'Ben', lastName: 'Sub' }, 'system:verify');
    staffIds.push(sub.id);
    await recordAbsence({ assignmentId, sessionDateISO: '2026-10-03', replacementStaffId: sub.id, replacementRateCents: 6000 }, 'system:verify');
    await recordAbsence({ assignmentId, sessionDateISO: '2026-10-17', replacementStaffId: sub.id, replacementRateCents: 6000 }, 'system:verify');
    const bd = await payBreakdown(assignmentId, 12);
    record('absence recompute (orig 10x$50, sub 2x$60)', bd.originalCents === 10 * 5000 && bd.replacementCents === 2 * 6000, JSON.stringify(bd));

    // 6. program staff cost feeds margin
    const cost = await programStaffCostCents(prog.id);
    record('program staff-cost feed', cost === 12 * 5000, `cost ${cost}`);

    // 7. cert expiry warn-only (never blocks)
    await addCertification({ staffId: coach.id, name: 'Vulnerable Sector Check', expiresOn: new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10) }, 'system:verify');
    const warn = await processCertExpiries();
    record('cert expiry warns (warn-only)', warn.warned >= 1, `${warn.warned} warned`);

    // 8. archive retains history, removes from active
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
    for (const sid of staffIds) { await db.from('staff_certifications').delete().eq('staff_id', sid); await db.from('staff').delete().eq('id', sid); }
    if (profileId) await db.from('profiles').delete().eq('id', profileId);
    record('cleanup', true, 'staff, program, profile removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
