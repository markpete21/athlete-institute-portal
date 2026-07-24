import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { checkIn, checkOut, createWeek, dayRoster, listWeeks, registerCamper } from '@/lib/camps/camps';

/**
 * DEV-ONLY: Module 8 - weeks + per-week capacity/waitlist, registration into a
 * week, daily check-in/out with authorized pickup, day roster. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let programId: number | null = null;
  let weekId: number | null = null;
  let famId: number | null = null;

  try {
    const camp = (await listProgramTypes()).find((t) => t.key === 'camp')!;
    const prog = await createProgram({ name: 'Verify Skills Camp', programTypeId: camp.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    await db.from('programs').update({ status: 'registration_open' }).eq('id', prog.id);

    // 1. week with capacity 1
    weekId = await createWeek({ programId: prog.id, name: 'Week 1 - Boys 10-12', startDate: '2026-07-06', endDate: '2026-07-10', dailyStart: '09:00', dailyEnd: '16:00', capacity: 1, priceCents: 30000 }, 'system:verify');
    const weeks = await listWeeks(prog.id);
    record('week created with capacity + spots', weeks.length === 1 && weeks[0].spots_left === 1, JSON.stringify(weeks[0]?.spots_left));

    const { data: fam } = await db.from('families').insert({ name: 'Camp Fam' }).select('id').single();
    famId = fam!.id;
    const mem = async (n: string) => (await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'dependent' }).select('id').single()).data!.id;

    // 2. register camper (fills the 1 spot) + friend request
    const r1 = await registerCamper({ programId: prog.id, campWeekId: weekId!, familyMemberId: await mem('Kid1'), familyId: fam!.id, friendRequest: 'group with Kid2', actorClerkId: 'system:verify' });
    record('camper registered (active) w/ friend request', !r1.waitlisted, 'active');

    // 3. second camper waitlisted (capacity 1)
    const r2 = await registerCamper({ programId: prog.id, campWeekId: weekId!, familyMemberId: await mem('Kid2'), familyId: fam!.id, actorClerkId: 'system:verify' });
    record('over-capacity camper waitlisted', r2.waitlisted, 'waitlisted');

    // 4. check-in / check-out with authorized pickup
    await checkIn({ registrationId: r1.registrationId, campWeekId: weekId!, dayISO: '2026-07-06', staffClerkId: 'system:verify' });
    await checkOut({ registrationId: r1.registrationId, dayISO: '2026-07-06', authorizedPickup: 'Mom', staffClerkId: 'system:verify' });
    const roster = await dayRoster(weekId!, '2026-07-06');
    const kid1 = roster.find((x) => x.registrationId === r1.registrationId)!;
    record('check-in/out + authorized pickup', kid1.checkedIn && kid1.checkedOut && kid1.pickup === 'Mom', JSON.stringify(kid1));
    record('day roster shows active campers', roster.length === 1, `${roster.length} on roster`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (programId) {
      await db.from('camp_checkins').delete().eq('camp_week_id', weekId ?? -1);
      await db.from('registrations').delete().eq('program_id', programId);
      if (weekId) await db.from('camp_weeks').delete().eq('id', weekId);
      await db.from('programs').delete().eq('id', programId);
    }
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'camp, week, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
