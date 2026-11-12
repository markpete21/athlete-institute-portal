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
export interface StatLine extends BoxLine { id: number; gameId: number; team: string; division: string; playerId: number | null; source: string | null }
export interface TeamBox { team: string; lines: StatLine[]; total: StatLine | null }

const COLS = 'id, game_id, division, team, is_total, player_id, number, name, pts, reb, ast, stl, blk, tov, oreb, dreb, pf, fgm, fga, tpm, tpa, ftm, fta, min, sort_order, source';

function toLine(r: Record<string, unknown>): StatLine {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  return {
    id: r.id as number, gameId: r.game_id as number, team: r.team as string, division: (r.division as string) ?? '', playerId: (r.player_id as number) ?? null, source: (r.source as string) ?? null,
    isTotal: !!r.is_total, number: (r.number as string) ?? null, name: (r.name as string) ?? null,
    pts: Number(r.pts ?? 0), reb: Number(r.reb ?? 0), ast: Number(r.ast ?? 0),
    stl: n('stl'), blk: n('blk'), tov: n('tov'), oreb: n('oreb'), dreb: n('dreb'), pf: n('pf'), fgm: n('fgm'), fga: n('fga'), tpm: n('tpm'), tpa: n('tpa'), ftm: n('ftm'), fta: n('fta'), min: (r.min as string) ?? null,
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
      pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, oreb: l.oreb, dreb: l.dreb, pf: l.pf, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, ftm: l.ftm, fta: l.fta, min: l.min,
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


// --- Publishing and Superstat link state (columns from migration 0107) ------------

export interface GameStatsMeta { published: boolean; superstatMatchId: string | null; superstatStatus: string | null; syncedAt: string | null }

/**
 * Per-game stats state. Stats are loaded and checked privately; the public
 * Full stats button and page need `published`. Tolerant before 0107: every
 * game reads as unpublished.
 */
export async function gameStatsMeta(brandKey: string, leagueSlug: string): Promise<Map<number, GameStatsMeta>> {
  const out = new Map<number, GameStatsMeta>();
  const { data, error } = await supabaseAdmin().from('site_league_games').select('id, stats_published, superstat_match_id, superstat_status, superstat_synced_at').eq('brand_key', brandKey).eq('league_slug', leagueSlug);
  if (error || !data) return out;
  for (const r of data) out.set(r.id as number, { published: !!r.stats_published, superstatMatchId: (r.superstat_match_id as string) ?? null, superstatStatus: (r.superstat_status as string) ?? null, syncedAt: (r.superstat_synced_at as string) ?? null });
  return out;
}

/** Publish or unpublish stats: one game, or (gameId null) every game in the league that has stats loaded. */
export async function setStatsPublished(brandKey: string, leagueSlug: string, gameId: number | null, published: boolean, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  let ids: number[];
  if (gameId != null) ids = [gameId];
  else {
    const { data } = await db.from('site_league_stat_lines').select('game_id').eq('brand_key', brandKey).eq('league_slug', leagueSlug);
    ids = [...new Set((data ?? []).map((r) => r.game_id as number))];
  }
  if (!ids.length) return 0;
  const { error } = await db.from('site_league_games').update({ stats_published: published }).eq('brand_key', brandKey).eq('league_slug', leagueSlug).in('id', ids);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: published ? 'site.league.stats.publish' : 'site.league.stats.unpublish', target: `site:${brandKey}`, meta: { league: leagueSlug, games: ids.length } });
  return ids.length;
}


// --- Play-by-play, insights and season data (free, public once published) ---------

export interface GameEvent { seq: number; type: string; success: boolean | null; team: string; number: string | null; name: string | null; periodNumber: number | null; periodType: string | null; periodSeconds: number | null; matchSeconds: number | null; x: number | null; y: number | null; customName: string | null; gameId: number }

const EV_COLS = 'game_id, seq, type, success, team, number, name, period_number, period_type, period_seconds, match_seconds, x, y, custom_name';
function toEvent(r: Record<string, unknown>): GameEvent {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  return { gameId: r.game_id as number, seq: r.seq as number, type: r.type as string, success: (r.success as boolean) ?? null, team: r.team as string, number: (r.number as string) ?? null, name: (r.name as string) ?? null, periodNumber: n('period_number'), periodType: (r.period_type as string) ?? null, periodSeconds: n('period_seconds'), matchSeconds: n('match_seconds'), x: n('x'), y: n('y'), customName: (r.custom_name as string) ?? null };
}

/** One game's play-by-play, in order. Empty before 0107 or when nothing was synced. */
export async function gameEvents(brandKey: string, gameId: number): Promise<GameEvent[]> {
  const { data, error } = await supabaseAdmin().from('site_league_events').select(EV_COLS).eq('brand_key', brandKey).eq('game_id', gameId).order('seq').limit(2000);
  return error || !data ? [] : data.map(toEvent);
}

/** Field-goal attempts (with court positions) across games, for a team or one player. */
export async function shotEvents(brandKey: string, gameIds: number[], team: string, number?: string | null): Promise<GameEvent[]> {
  if (!gameIds.length) return [];
  let q = supabaseAdmin().from('site_league_events').select(EV_COLS).eq('brand_key', brandKey).in('game_id', gameIds).eq('team', team).in('type', ['two_point', 'three_point']);
  if (number) q = q.eq('number', number);
  const { data, error } = await q.limit(5000);
  return error || !data ? [] : data.map(toEvent).filter((e) => e.x != null && e.y != null);
}

export interface GameInsights { gameId: number; team: string; status: string; summary: { whatsWorking?: string[]; focusAreas?: string[]; suggestions?: string[] } | null; ratings: Record<string, { value: number; comment: string }> | null }

/** Written team insights per game (ready ones only). */
export async function insightsFor(brandKey: string, gameIds: number[]): Promise<GameInsights[]> {
  if (!gameIds.length) return [];
  const { data, error } = await supabaseAdmin().from('site_league_insights').select('game_id, team, status, payload').eq('brand_key', brandKey).in('game_id', gameIds).eq('status', 'ready');
  if (error || !data) return [];
  return data.map((r) => { const p = (r.payload ?? {}) as { summary?: GameInsights['summary']; ratings?: GameInsights['ratings'] }; return { gameId: r.game_id as number, team: r.team as string, status: r.status as string, summary: p.summary ?? null, ratings: p.ratings ?? null }; });
}

/** Ids of games whose stats the public may see (every loaded game in the editor's preview). */
export async function visibleStatGameIds(brandKey: string, leagueSlug: string, preview: boolean): Promise<Set<number>> {
  const [lines, meta] = await Promise.all([statLinesByGame(brandKey, leagueSlug), gameStatsMeta(brandKey, leagueSlug)]);
  return new Set([...lines.keys()].filter((id) => preview || meta.get(id)?.published));
}

/** Every stat line of the visible games (for season averages, team pages and leaders). */
export async function visibleSeasonLines(brandKey: string, leagueSlug: string, preview: boolean): Promise<StatLine[]> {
  const [lines, meta] = await Promise.all([statLinesByGame(brandKey, leagueSlug), gameStatsMeta(brandKey, leagueSlug)]);
  return [...lines.entries()].filter(([id]) => preview || meta.get(id)?.published).flatMap(([, l]) => l);
}
