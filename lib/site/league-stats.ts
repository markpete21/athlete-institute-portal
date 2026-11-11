import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { parseBoxScore, type BoxLine } from '@/lib/site/boxscore';

/**
 * Full stats (box scores) for site-run league games. Stored one row per
 * player per game (+ a TEAM totals row), in the Compete game_stat_lines
 * shape plus the extra box-score columns. Tolerant before migration 0106:
 * every read returns empty instead of throwing.
 */
export interface StatLine extends BoxLine { id: number; gameId: number; team: string; division: string; playerId: number | null }
export interface TeamBox { team: string; lines: StatLine[]; total: StatLine | null }

const COLS = 'id, game_id, division, team, is_total, player_id, number, name, pts, reb, ast, stl, blk, tov, oreb, fgm, fga, tpm, tpa, ftm, fta, min, sort_order';

function toLine(r: Record<string, unknown>): StatLine {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  return {
    id: r.id as number, gameId: r.game_id as number, team: r.team as string, division: (r.division as string) ?? '', playerId: (r.player_id as number) ?? null,
    isTotal: !!r.is_total, number: (r.number as string) ?? null, name: (r.name as string) ?? null,
    pts: Number(r.pts ?? 0), reb: Number(r.reb ?? 0), ast: Number(r.ast ?? 0),
    stl: n('stl'), blk: n('blk'), tov: n('tov'), oreb: n('oreb'), fgm: n('fgm'), fga: n('fga'), tpm: n('tpm'), tpa: n('tpa'), ftm: n('ftm'), fta: n('fta'), min: (r.min as string) ?? null,
  };
}

/** Every uploaded line for a league, by game id. */
export async function statLinesByGame(brandKey: string, leagueSlug: string): Promise<Map<number, StatLine[]>> {
  const out = new Map<number, StatLine[]>();
  const { data, error } = await supabaseAdmin().from('site_league_stat_lines').select(COLS).eq('brand_key', brandKey).eq('league_slug', leagueSlug).order('game_id').order('sort_order').order('id');
  if (error || !data) return out;
  for (const r of data) { const l = toLine(r); out.set(l.gameId, [...(out.get(l.gameId) ?? []), l]); }
  return out;
}

export async function gameStatLines(brandKey: string, gameId: number): Promise<StatLine[]> {
  const { data, error } = await supabaseAdmin().from('site_league_stat_lines').select(COLS).eq('brand_key', brandKey).eq('game_id', gameId).order('sort_order').order('id');
  return error || !data ? [] : data.map(toLine);
}

/** Split a game's lines into its two teams (home first). */
export function boxesFor(lines: StatLine[], home: string, away: string): [TeamBox, TeamBox] {
  const box = (team: string): TeamBox => ({ team, lines: lines.filter((l) => l.team === team && !l.isTotal), total: lines.find((l) => l.team === team && l.isTotal) ?? null });
  return [box(home), box(away)];
}

/** Has anything been uploaded for this game? (Drives the Full stats button.) */
export const hasFullStats = (lines: StatLine[] | undefined) => !!lines && lines.length > 0;

/**
 * Replace one team's box score for a game with the pasted text. Players are
 * matched to the roster by jersey number (then name) for names and player ids.
 */
export async function saveTeamBox(brandKey: string, leagueSlug: string, game: { id: number; division: string }, team: string, text: string, actorClerkId: string): Promise<{ players: number; total: boolean; warnings: string[] }> {
  const parsed = parseBoxScore(text);
  if (!parsed.lines.length && !parsed.total) throw new Error(parsed.warnings[0] ?? 'Nothing to upload.');
  const db = supabaseAdmin();
  const { data: roster } = await db.from('site_league_players').select('id, number, name').eq('brand_key', brandKey).eq('league_slug', leagueSlug).eq('team', team).eq('division', game.division);
  const match = (l: BoxLine) => (roster ?? []).find((p) => (l.number && String(p.number ?? '').replace(/^#/, '') === l.number) || (l.name && p.name.trim().toLowerCase() === l.name.trim().toLowerCase()));
  const row = (l: BoxLine, i: number) => {
    const p = l.isTotal ? null : match(l);
    return {
      brand_key: brandKey, league_slug: leagueSlug, game_id: game.id, division: game.division, team, is_total: l.isTotal, player_id: p?.id ?? null,
      number: l.number, name: l.isTotal ? 'TEAM' : (l.name ?? p?.name ?? null),
      pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, oreb: l.oreb, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, ftm: l.ftm, fta: l.fta, min: l.min,
      sort_order: l.isTotal ? 999 : i, source: 'paste', created_by: actorClerkId,
    };
  };
  const { error: delErr } = await db.from('site_league_stat_lines').delete().eq('brand_key', brandKey).eq('game_id', game.id).eq('team', team);
  if (delErr) throw new Error(delErr.message);
  const rows = [...parsed.lines.map(row), ...(parsed.total ? [row(parsed.total, 999)] : [])];
  const { error } = await db.from('site_league_stat_lines').insert(rows);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'site.league.stats.upload', target: `site:${brandKey}`, meta: { gameId: game.id, team, players: parsed.lines.length, total: !!parsed.total } });
  return { players: parsed.lines.length, total: !!parsed.total, warnings: parsed.warnings };
}

export async function clearGameStats(brandKey: string, gameId: number, actorClerkId: string): Promise<void> {
  await supabaseAdmin().from('site_league_stat_lines').delete().eq('brand_key', brandKey).eq('game_id', gameId);
  await audit({ actorId: actorClerkId, action: 'site.league.stats.clear', target: `site:${brandKey}`, meta: { gameId } });
}
