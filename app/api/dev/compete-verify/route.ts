import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { displayName, divisionDetail, listDivisions } from '@/lib/compete/compete';
import { createDivision } from '@/lib/competitive/competitive';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';

/**
 * DEV-ONLY: Compete. Portal - name masking rule, per-division visibility,
 * type-based defaults, family suppression override. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const rec = (s: string, ok: boolean, d: string) => steps.push({ step: s, ok, detail: d });
  const progIds: number[] = [];
  const divIds: number[] = [];

  try {
    // 1. the masking function itself
    rec('full name when enabled', displayName('Ava', 'Peterson', { showFullNames: true, hidden: false }) === 'Ava Peterson', 'Ava Peterson');
    rec('masked to last initial when disabled', displayName('Ava', 'Peterson', { showFullNames: false, hidden: false }) === 'Ava P.', 'Ava P.');
    rec('family suppression always wins', displayName('Ava', 'Peterson', { showFullNames: true, hidden: true }) === 'Team member', 'Team member');
    rec('missing name never leaks blank', displayName(null, null, { showFullNames: true, hidden: false }) === 'Team member', 'Team member');

    const types = await listProgramTypes();
    const league = types.find((t) => t.key === 'league')!;
    const academy = types.find((t) => t.key === 'academy')!;
    const club = types.find((t) => t.key === 'club')!;

    // 2. type-based defaults at creation
    const lp = await createProgram({ name: 'Compete Verify League', programTypeId: league.id, actorClerkId: 'system:verify' });
    // A tournament is a LEAGUE-type program with tournament_mode set (Module 9),
    // not its own program type - so set the mode before creating the division.
    const tp = await createProgram({ name: 'Compete Verify Tournament', programTypeId: league.id, actorClerkId: 'system:verify' });
    await db.from('programs').update({ tournament_mode: 'championship' }).eq('id', tp.id);
    const ap = await createProgram({ name: 'Compete Verify Academy', programTypeId: academy.id, actorClerkId: 'system:verify' });
    const cp = await createProgram({ name: 'Compete Verify Club', programTypeId: club.id, actorClerkId: 'system:verify' });
    progIds.push(lp.id, tp.id, ap.id, cp.id);
    const ld = await createDivision({ programId: lp.id, name: 'Verify League Div', sport: 'basketball' }, 'system:verify');
    const td = await createDivision({ programId: tp.id, name: 'Verify Tourney Div', sport: 'basketball' }, 'system:verify');
    const ad = await createDivision({ programId: ap.id, name: 'Verify Academy Div', sport: 'basketball' }, 'system:verify');
    const cd = await createDivision({ programId: cp.id, name: 'Verify Club Div', sport: 'basketball' }, 'system:verify');
    divIds.push(ld, td, ad, cd);

    const row = async (id: number) => (await db.from('divisions').select('show_on_compete, show_full_names').eq('id', id).single()).data!;
    const l = await row(ld), t = await row(td), a = await row(ad), c = await row(cd);
    rec('league defaults to MASKED, public', l.show_full_names === false && l.show_on_compete === true, JSON.stringify(l));
    rec('tournament (tournament_mode set) defaults to FULL names, public', t.show_full_names === true && t.show_on_compete === true, JSON.stringify(t));
    rec('rep/club defaults to FULL names, public', c.show_full_names === true && c.show_on_compete === true, JSON.stringify(c));
    rec('academy is never public', a.show_on_compete === false, JSON.stringify(a));

    // 3. listing respects the flag
    const listed = await listDivisions();
    const ids = listed.map((d) => d.id);
    rec('public list includes league+tournament, excludes academy', ids.includes(ld) && ids.includes(td) && !ids.includes(ad), `${listed.length} listed`);

    // 4. a hidden division is a 404 to the public, not a leak
    rec('unpublished division returns null (404)', (await divisionDetail(ad)) === null, 'null');
    const detail = await divisionDetail(ld);
    rec('published division returns standings + games + rosters', !!detail && Array.isArray(detail.games) && Array.isArray(detail.rosters), detail ? `${detail.games.length} games` : 'null');
  } catch (err) {
    rec('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (divIds.length) { await db.from('team_members').delete().in('division_id', divIds); await db.from('teams').delete().in('division_id', divIds); await db.from('divisions').delete().in('id', divIds); }
    if (progIds.length) { await db.from('registrations').delete().in('program_id', progIds); await db.from('programs').delete().in('id', progIds); }
    rec('cleanup', true, 'verify divisions + programs removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
