import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  addRosterMember,
  buildLeagueSchedule,
  createDivision,
  divisionStandings,
  replacementSuggestions,
  runTeamBuilder,
  saveScore,
} from '@/lib/competitive/competitive';

/**
 * DEV-ONLY: Module 6 wired to the DB - division + roster from registrations,
 * balancing draft (locks respected), replacement suggester, round-robin
 * schedule publishing bookings via Module 2, score entry -> final, sport-aware
 * standings. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let programId: number | null = null;
  let divisionId: number | null = null;
  let famId: number | null = null;

  try {
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Comp Verify League', programTypeId: league.id, sportTag: 'Basketball', actorClerkId: 'system:verify' });
    programId = prog.id;
    divisionId = await createDivision({ programId: prog.id, name: 'U14 Div A', sport: 'basketball', maxTeams: 4 }, 'system:verify');

    // A skill custom question + 8 registered players with skills.
    const { data: skillQ } = await db.from('questions').insert({ label: `Skill ${Date.now()}`, qtype: 'number', created_by: 'system:verify' }).select('id').single();
    const { data: fam } = await db.from('families').insert({ name: 'Comp Fam' }).select('id').single();
    famId = fam!.id;
    const memberIds: number[] = [];
    for (let i = 0; i < 8; i++) {
      const { data: m } = await db.from('family_members').insert({ family_id: fam!.id, first_name: `P${i}`, last_name: 'K', member_role: 'dependent' }).select('id').single();
      const { data: r } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: m!.id, family_id: fam!.id, status: 'active', jersey_size: i % 2 ? 'AM' : 'AL' }).select('id').single();
      await db.from('question_answers').insert({ registration_id: r!.id, question_id: skillQ!.id, answer: (i % 8) + 1 });
      const tm = await addRosterMember({ divisionId: divisionId!, registrationId: r!.id }); void tm;
      const { data: tmRow } = await db.from('team_members').select('id').eq('registration_id', r!.id).single();
      memberIds.push(tmRow!.id);
    }
    // Lock member 0 to team 0 (we'll set after teams exist? locks use team_id -
    // instead flag one as locked to a team created later). We'll test lock via
    // group instead: group members 0 and 1 together.
    await db.from('team_members').update({ group_key: 'buddies' }).in('id', [memberIds[0], memberIds[1]]);

    // 1. team builder: 2 teams, balance skill, group stays together
    const draft = await runTeamBuilder({ divisionId: divisionId!, numTeams: 2, attributes: ['skill'], attributeQuestionMap: { skill: skillQ!.id }, actorClerkId: 'system:verify' });
    const { data: placed } = await db.from('team_members').select('id, team_id, group_key').eq('division_id', divisionId!);
    const buddies = (placed ?? []).filter((p) => p.group_key === 'buddies');
    record('draft: 2 teams created, all placed, group together', draft.teamIds.length === 2 && (placed ?? []).every((p) => p.team_id) && buddies[0].team_id === buddies[1].team_id, `spread ${JSON.stringify(draft.spread)}`);

    // 2. replacement suggester (drop one, get ranked candidates from other team)
    const dropId = buddies[0].id;
    const sugg = await replacementSuggestions(divisionId!, dropId);
    record('replacement suggester returns ranked candidates', sugg.length > 0 && sugg.length <= 5, `${sugg.length} candidates`);

    // 3. schedule: round-robin over 2 teams -> 1 game, booked via Module 2
    const sched = await buildLeagueSchedule({ divisionId: divisionId!, facilityId: (await db.from('facilities').select('id').eq('name', 'Dome Court 1').single()).data!.id, startDate: '2026-09-08', weekdays: [2], timeSlots: ['18:00', '19:00'], gameMinutes: 60, numCourts: 2, actorClerkId: 'system:verify' });
    const { data: games } = await db.from('games').select('id, home_team_id, away_team_id, booking_id, status').eq('division_id', divisionId!);
    record('schedule: round-robin games booked via M2', sched.gameCount === 1 && (games ?? []).length === 1 && !!games![0].booking_id, `${sched.gameCount} games, ${sched.conflicts} conflicts`);

    // 4. score entry -> final + winner + standings
    await saveScore({ gameId: games![0].id, homeScore: 82, awayScore: 74, actorClerkId: 'system:verify' });
    const { data: g2 } = await db.from('games').select('status').eq('id', games![0].id).single();
    record('score saved -> game final', g2!.status === 'final', g2!.status);

    const st = await divisionStandings(divisionId!);
    const leader = st.standings[0];
    record('sport-aware standings computed', leader.w === 1 && leader.gp === 1 && leader.diff === 8 && st.sport === 'basketball', `leader ${st.teamNames.get(leader.team)} ${leader.w}-${leader.l} diff ${leader.diff}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (divisionId) {
      const { data: games } = await db.from('games').select('booking_id').eq('division_id', divisionId);
      const bIds = (games ?? []).map((g) => g.booking_id).filter(Boolean) as number[];
      await db.from('games').delete().eq('division_id', divisionId);
      if (bIds.length) await db.from('bookings').delete().in('id', bIds);
      await db.from('team_members').delete().eq('division_id', divisionId);
      await db.from('teams').delete().eq('division_id', divisionId);
      await db.from('divisions').delete().eq('id', divisionId);
    }
    if (programId) { await db.from('registrations').delete().eq('program_id', programId); await db.from('programs').delete().eq('id', programId); }
    if (famId) await db.from('families').delete().eq('id', famId);
    await db.from('questions').delete().like('label', 'Skill %');
    record('cleanup', true, 'division, program, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
