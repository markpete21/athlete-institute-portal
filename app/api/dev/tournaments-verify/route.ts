import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { createDivision } from '@/lib/competitive/competitive';
import { buildBracket, registerTeam, setTournamentMode } from '@/lib/tournaments/tournaments';

/**
 * DEV-ONLY: Module 9 - team entry (one payment), roster upload -> M6 rosters,
 * account-less coach, championship bracket. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let programId: number | null = null;
  let divisionId: number | null = null;
  let famId: number | null = null;
  const staffIds: number[] = [];

  try {
    const tour = (await listProgramTypes()).find((t) => t.key === 'tournament') ?? (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Verify Tournament', programTypeId: tour.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    await db.from('programs').update({ status: 'registration_open', base_price_cents: 60000 }).eq('id', prog.id);
    await setTournamentMode(prog.id, 'championship', 'system:verify');
    divisionId = await createDivision({ programId: prog.id, name: 'Open Div', sport: 'basketball' }, 'system:verify');

    const { data: fam } = await db.from('families').insert({ name: 'Tourney Fam' }).select('id').single();
    famId = fam!.id;
    const cap = async () => (await db.from('family_members').insert({ family_id: fam!.id, first_name: 'Cap', last_name: 'K', member_role: 'adult' }).select('id').single()).data!.id;

    // 1. register a team w/ roster upload + account-less coach
    const t1 = await registerTeam({ programId: prog.id, divisionId: divisionId!, teamName: 'Team Alpha', captainFamilyMemberId: await cap(), familyId: fam!.id, roster: [{ firstName: 'A', lastName: '1' }, { firstName: 'A', lastName: '2' }, { firstName: 'A', lastName: '3' }], coachName: 'Coach Carter', actorClerkId: 'system:verify' });
    if (t1.coachStaffId) staffIds.push(t1.coachStaffId);
    const { data: members } = await db.from('team_members').select('id').eq('team_id', t1.teamId);
    record('team entry: roster uploaded + account-less coach', (members ?? []).length === 3 && !!t1.coachStaffId && t1.entryRegistrationId > 0, `${(members ?? []).length} roster, coach ${t1.coachStaffId}`);

    // 2. one payment per team (single entry registration)
    const { count: entryCount } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', prog.id);
    record('one registration (payment) per team', entryCount === 1, `${entryCount} entries`);

    // 3. register 3 more teams -> championship bracket seeds 4 teams -> 2 rounds
    for (const n of ['Bravo', 'Charlie', 'Delta']) {
      const t = await registerTeam({ programId: prog.id, divisionId: divisionId!, teamName: `Team ${n}`, captainFamilyMemberId: await cap(), familyId: fam!.id, roster: [{ firstName: n, lastName: '1' }], actorClerkId: 'system:verify' });
      if (t.coachStaffId) staffIds.push(t.coachStaffId);
    }
    const bracket = await buildBracket(divisionId!);
    record('championship bracket (4 teams -> 2 rounds, 2 first games)', bracket.rounds === 2 && bracket.firstRound.length === 2 && bracket.teamNames.length === 4, `${bracket.rounds}r`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (divisionId) { await db.from('team_members').delete().eq('division_id', divisionId); await db.from('teams').delete().eq('division_id', divisionId); }
    if (programId) { await db.from('registrations').delete().eq('program_id', programId); if (divisionId) await db.from('divisions').delete().eq('id', divisionId); await db.from('programs').delete().eq('id', programId); }
    if (staffIds.length) await db.from('staff').delete().in('id', staffIds);
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'tournament, teams, coach records removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
