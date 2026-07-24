import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { createDivision } from '@/lib/competitive/competitive';
import { captainSignup, configureLeague, freeAgentSignup, leaguePriceCents, memberJoin, smallGroupSignup } from '@/lib/leagues/leagues';

/**
 * DEV-ONLY: Module 7 - four registration paths, join-link validity, small-group
 * hold-until-complete, path pricing. Cleaned up.
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
    const prog = await createProgram({ name: 'Verify Adult League', programTypeId: league.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    await db.from('programs').update({ base_price_cents: 12000, status: 'registration_open' }).eq('id', prog.id);
    await configureLeague({ programId: prog.id, pricing: 'both', teamRateCents: 90000 }, 'system:verify');
    divisionId = await createDivision({ programId: prog.id, name: 'Div A', sport: 'basketball', maxPlayers: 2 }, 'system:verify');

    const { data: fam } = await db.from('families').insert({ name: 'League Fam' }).select('id').single();
    famId = fam!.id;
    const mem = async (n: string) => (await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'adult' }).select('id').single()).data!.id;

    // 1. captain signs up a team paying the team rate + join link
    const cap = await captainSignup({ programId: prog.id, divisionId: divisionId!, teamName: 'Ballers', familyMemberId: await mem('Cap'), familyId: fam!.id, payTeamRate: true, startDateISO: '2026-09-08', actorClerkId: 'system:verify' });
    record('captain creates team + join link', !!cap.joinToken && cap.teamId > 0, `token ${cap.joinToken.slice(0, 6)}…`);
    record('captain team-rate pricing', (await leaguePriceCents(prog.id, 'captain', true)) === 90000, 'ok');

    // 2. member joins via link (team not full yet: max 2, captain is 1)
    const join = await memberJoin({ joinToken: cap.joinToken, familyMemberId: await mem('Teammate'), familyId: fam!.id, actorClerkId: 'system:verify' });
    record('member joins via link', join.teamId === cap.teamId, `joined team ${join.teamId}`);

    // 3. link closes when full (max_players 2 reached)
    let full = false;
    try { await memberJoin({ joinToken: cap.joinToken, familyMemberId: await mem('Third'), familyId: fam!.id, actorClerkId: 'system:verify' }); } catch (e) { full = e instanceof Error && e.message.includes('full'); }
    record('join link closes at max players', full, `blocked=${full}`);

    // 4. small group holds until complete (member + 2 named = need 3)
    const g1 = await smallGroupSignup({ programId: prog.id, divisionId: divisionId!, familyMemberId: await mem('G1'), familyId: fam!.id, groupKey: 'grp', teammateNames: ['G2 K', 'G3 K'], actorClerkId: 'system:verify' });
    record('small group incomplete after first', !g1.complete, 'held');
    await smallGroupSignup({ programId: prog.id, divisionId: divisionId!, familyMemberId: await mem('G2'), familyId: fam!.id, groupKey: 'grp', teammateNames: [], actorClerkId: 'system:verify' });
    const g3 = await smallGroupSignup({ programId: prog.id, divisionId: divisionId!, familyMemberId: await mem('G3'), familyId: fam!.id, groupKey: 'grp', teammateNames: [], actorClerkId: 'system:verify' });
    record('small group completes when all named register', g3.complete, 'complete');

    // 5. free agent pays player fee, no team
    const fa = await freeAgentSignup({ programId: prog.id, divisionId: divisionId!, familyMemberId: await mem('Free'), familyId: fam!.id, actorClerkId: 'system:verify' });
    const { data: faReg } = await db.from('registrations').select('team_id, league_path').eq('id', fa.registrationId).single();
    record('free agent: no team, player-priced', faReg!.team_id === null && faReg!.league_path === 'free_agent' && (await leaguePriceCents(prog.id, 'free_agent')) === 12000, 'ok');
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (divisionId) { await db.from('team_members').delete().eq('division_id', divisionId); await db.from('teams').delete().eq('division_id', divisionId); }
    if (programId) { await db.from('registrations').delete().eq('program_id', programId); if (divisionId) await db.from('divisions').delete().eq('id', divisionId); await db.from('programs').delete().eq('id', programId); }
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'league, division, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
