import { NextResponse } from 'next/server';
import { ageEligible, deriveStanding, retentionRate } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, deriveStandingFor, generateSessions, listProgramTypes } from '@/lib/programs/programs';

/**
 * DEV-ONLY: Stage-1 program spine - type seeds + category default-from-type,
 * pure standing/age/retention helpers, live standing derivation from
 * registration history, and session generation via the Module 2 recurrence
 * engine. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  const extra: { memberIds: number[]; regIds: number[]; familyId?: number } = { memberIds: [], regIds: [] };

  try {
    // 0. pure helpers
    record('pure: standing derivation', deriveStanding([], 1) === 'brand_new' && deriveStanding([{ program_id: 1 }], 1) === 'returning_athlete' && deriveStanding([{ program_id: 2 }], 1) === 'returning_member', 'ok');
    record('pure: age eligibility by DOB', ageEligible('2014-06-01', 8, 12, '2026-07-23') && !ageEligible('2020-06-01', 8, 12, '2026-07-23'), 'ok');
    record('pure: retention rate', retentionRate([1, 2, 3, 4], [2, 4, 5]) === 50, `${retentionRate([1, 2, 3, 4], [2, 4, 5])}%`);

    // 1. type seeds present with correct default categories
    const types = await listProgramTypes();
    const academy = types.find((t) => t.key === 'academy');
    const clinic = types.find((t) => t.key === 'clinic');
    record(
      'type seeds + default categories',
      types.length >= 7 && academy?.default_category === 'Academy' && clinic?.default_category === 'Youth Sports' && clinic?.default_proration === 'clinic',
      `${types.length} types`,
    );

    // 2. create program inherits category + proration from type (Clinic)
    const prog = await createProgram({ name: 'Verify Clinic', programTypeId: clinic!.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);
    record('program inherits category + proration from type', prog.category === 'Youth Sports' && prog.proration_method === 'clinic', `cat=${prog.category}, prorate=${prog.proration_method}`);

    // 3. category override on create (Academy type but forced Adult)
    const adult = await createProgram({ name: 'Verify Adult League', programTypeId: academy!.id, category: 'Adult', actorClerkId: 'system:verify' });
    programIds.push(adult.id);
    record('category override honored', adult.category === 'Adult', adult.category);

    // 4. live standing derivation from registration history
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `prog_${Date.now()}`, email: `prog_${Date.now()}@example.test` }).select('id').single();
    const { data: fam } = await db.from('families').insert({ name: 'Prog Verify', hoh_profile_id: prof!.id }).select('id').single();
    extra.familyId = fam!.id;
    const { data: mem } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'Kid', last_name: 'V', member_role: 'dependent' }).select('id').single();
    extra.memberIds.push(mem!.id);

    // brand-new before any history
    record('live standing: brand_new with no history', (await deriveStandingFor(mem!.id, prog.id)) === 'brand_new', 'ok');
    // a prior reg in ANOTHER program -> returning_member for this one
    const { data: r1 } = await db.from('registrations').insert({ program_id: adult.id, family_member_id: mem!.id, family_id: fam!.id, status: 'active', standing: 'brand_new' }).select('id').single();
    extra.regIds.push(r1!.id);
    record('live standing: returning_member (history elsewhere)', (await deriveStandingFor(mem!.id, prog.id)) === 'returning_member', 'ok');
    // a prior reg in THIS program -> returning_athlete forever
    const { data: r2 } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: mem!.id, family_id: fam!.id, status: 'withdrawn', standing: 'brand_new' }).select('id').single();
    extra.regIds.push(r2!.id);
    record('live standing: returning_athlete (even after withdrawal)', (await deriveStandingFor(mem!.id, prog.id)) === 'returning_athlete', 'ok');

    // 5. sessions via Module 2 recurrence (clinic every Saturday x4)
    const court = (await db.from('facilities').select('id, name').eq('name', 'Fieldhouse North').single()).data!.id;
    const gen = await generateSessions({ programId: prog.id, facilityId: court, pattern: { freq: 'weekly', byWeekday: [6] }, startDate: '2026-09-05', startTime: '10:00', endTime: '11:30', count: 4, actorClerkId: 'system:verify' });
    const { data: sess } = await db.from('program_sessions').select('id, booking_id').eq('program_id', prog.id);
    record('sessions via M2 recurrence (4 Saturdays, booked)', gen.sessionCount === 4 && (sess ?? []).length === 4 && (sess ?? []).every((s) => s.booking_id), `${gen.sessionCount} sessions`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const pid of programIds) {
      const { data: sess } = await db.from('program_sessions').select('booking_id, series_id').eq('program_id', pid);
      const bIds = (sess ?? []).map((s) => s.booking_id).filter(Boolean) as number[];
      const sIds = [...new Set((sess ?? []).map((s) => s.series_id).filter(Boolean))] as number[];
      await db.from('registrations').delete().eq('program_id', pid);
      await db.from('programs').delete().eq('id', pid);
      if (bIds.length) await db.from('bookings').delete().in('id', bIds);
      if (sIds.length) await db.from('booking_series').delete().in('id', sIds);
    }
    if (extra.familyId) await db.from('families').delete().eq('id', extra.familyId);
    record('cleanup', true, 'programs, sessions, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
