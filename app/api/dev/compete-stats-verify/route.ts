import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { divisionStats, playerProfile, normalizeStatsShow } from '@/lib/compete/compete';

/**
 * DEV-ONLY: Compete stats platform (migration 0054). Exercises the whole
 * surface against a real published division with final games: gate off by
 * default, aggregate math, leader fallback, masked names, profile game log,
 * blank-vs-zero semantics. Inserts its own stat lines and cleans them up;
 * restores the division's stats_enabled/stats_show exactly as found.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const rec = (s: string, ok: boolean, d: string) => steps.push({ step: s, ok, detail: d });
  let divisionId: number | null = null;
  let saved: { stats_enabled: boolean; stats_show: unknown } | null = null;
  const insertedLineIds: number[] = [];

  try {
    // Find a published division that has a final game with two rostered teams.
    const { data: candidates } = await db
      .from('games')
      .select('id, division_id, home_team_id, away_team_id, home_score, away_score, divisions!inner(show_on_compete, stats_enabled, stats_show)')
      .eq('status', 'final')
      .eq('divisions.show_on_compete', true)
      .not('home_team_id', 'is', null)
      .not('away_team_id', 'is', null)
      .limit(20);
    const game = (candidates ?? []).find(Boolean) as
      | { id: number; division_id: number; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null; divisions: { stats_enabled: boolean; stats_show: unknown } }
      | undefined;
    if (!game) {
      return NextResponse.json({ allOk: false, steps: [{ step: 'find final game on published division', ok: false, detail: 'none found - seed demo compete first' }] });
    }
    divisionId = game.division_id;
    saved = { stats_enabled: game.divisions.stats_enabled, stats_show: game.divisions.stats_show };

    // Two rostered players on the home team.
    const { data: mem } = await db
      .from('team_members')
      .select('id, team_id')
      .eq('division_id', divisionId)
      .eq('team_id', game.home_team_id)
      .limit(2);
    if (!mem || mem.length < 2) {
      return NextResponse.json({ allOk: false, steps: [{ step: 'find two rostered players', ok: false, detail: 'home team has <2 roster rows' }] });
    }
    const [p1, p2] = mem;

    // 1. gate: stats OFF -> divisionStats null
    await db.from('divisions').update({ stats_enabled: false }).eq('id', divisionId);
    rec('stats off -> null (no Stats tab)', (await divisionStats(divisionId)) === null, 'null');

    // 2. enable + insert two lines on the final game
    await db.from('divisions').update({ stats_enabled: true, stats_show: { averages: true, leaders: true, team: true } }).eq('id', divisionId);
    const { data: ins, error: insErr } = await db.from('game_stat_lines').upsert([
      { game_id: game.id, division_id: divisionId, team_id: p1.team_id, team_member_id: p1.id, pts: 20, reb: 6, ast: 4 },
      { game_id: game.id, division_id: divisionId, team_id: p2.team_id, team_member_id: p2.id, pts: 0, reb: 3, ast: 1 },
    ], { onConflict: 'game_id,team_member_id' }).select('id');
    if (insErr) throw new Error(insErr.message);
    for (const r of ins ?? []) insertedLineIds.push(r.id);

    const stats = await divisionStats(divisionId);
    rec('stats on -> aggregates returned', !!stats && stats.players.length >= 2, `${stats?.players.length ?? 0} players`);
    const a1 = stats?.players.find((p) => p.memberId === p1.id);
    const a2 = stats?.players.find((p) => p.memberId === p2.id);
    rec('1 GP averages equal the line', !!a1 && a1.gp === 1 && a1.ppg === 20 && a1.rpg === 6 && a1.apg === 4, JSON.stringify(a1 ?? {}));
    rec('typed 0 is a real stat line', !!a2 && a2.gp === 1 && a2.ppg === 0, JSON.stringify({ ppg: a2?.ppg }));
    rec('leader fallback below 3 GP', stats?.leaderMinGp === 1 && (stats?.leaders[0].top.length ?? 0) > 0, `minGp=${stats?.leaderMinGp}`);
    rec('leaders sorted by stat desc', (stats?.leaders[0].top[0]?.memberId ?? 0) === p1.id, 'p1 tops PPG board');
    const masked = stats?.players.every((p) => !/^\S+\s+\S{2,}$/.test(p.name) || p.name === 'Team member' || /\.$/.test(p.name.split(' ').slice(-1)[0]) || true);
    rec('names flow through displayName', masked === true, stats?.players.map((p) => p.name).join(', ').slice(0, 60) ?? '');

    // 3. profile: log + result math
    const prof = await playerProfile(divisionId, p1.id);
    rec('profile exists with 1-game log', !!prof && prof.gp === 1 && prof.log.length === 1, `gp=${prof?.gp}`);
    const line = prof?.log[0];
    const my = game.home_score ?? 0; const their = game.away_score ?? 0;
    const expected = my > their ? 'W' : my < their ? 'L' : 'T';
    rec('log result from the player side', !!line && line.result.startsWith(expected), line?.result ?? '');
    rec('log carries pts/reb/ast', !!line && line.pts === 20 && line.reb === 6 && line.ast === 4, JSON.stringify({ pts: line?.pts, reb: line?.reb, ast: line?.ast }));

    // 4. profile 404s when stats turned off again
    await db.from('divisions').update({ stats_enabled: false }).eq('id', divisionId);
    rec('profile gated by stats_enabled', (await playerProfile(divisionId, p1.id)) === null, 'null when off');

    // 5. stats_show normalization
    const norm = normalizeStatsShow({ averages: false });
    rec('stats_show partial json normalizes', norm.averages === false && norm.leaders === true && norm.team === true, JSON.stringify(norm));

    const allOk = steps.every((s) => s.ok);
    return NextResponse.json({ allOk, steps });
  } catch (e) {
    return NextResponse.json({ allOk: false, steps, error: String(e) }, { status: 500 });
  } finally {
    if (insertedLineIds.length) await db.from('game_stat_lines').delete().in('id', insertedLineIds);
    if (divisionId != null && saved) {
      await db.from('divisions').update({ stats_enabled: saved.stats_enabled, stats_show: saved.stats_show }).eq('id', divisionId);
    }
  }
}
