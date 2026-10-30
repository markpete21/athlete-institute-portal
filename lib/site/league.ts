import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Site-run leagues (ALL CAN Circuit first): games entered in the site editor,
 * standings computed from final scores. Used until the league moves into the
 * Compete portal; the public Circuit page reads this first and falls back to
 * Compete divisions when there are no site games.
 */
export type GameStatus = 'scheduled' | 'final' | 'postponed';

export interface Scorer { name: string; pts: number }
export interface GameScorers { home?: Scorer[]; away?: Scorer[]; potg?: string | null }

export interface LeagueGame {
  id: number;
  leagueSlug: string;
  division: string;
  startsAt: string | null;
  venue: string | null;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  status: GameStatus;
  note: string | null;
  scorers: GameScorers | null;
}

export interface StandingRow { team: string; gp: number; w: number; l: number; pf: number; pa: number; diff: number; pct: number }

const COLS = 'id, league_slug, division, starts_at, venue, home, away, home_score, away_score, status, note, scorers';

function toGame(r: Record<string, unknown>): LeagueGame {
  return {
    id: r.id as number, leagueSlug: r.league_slug as string, division: (r.division as string) ?? '', startsAt: (r.starts_at as string) ?? null, venue: (r.venue as string) ?? null,
    home: r.home as string, away: r.away as string, homeScore: (r.home_score as number) ?? null, awayScore: (r.away_score as number) ?? null, status: (r.status as GameStatus) ?? 'scheduled', note: (r.note as string) ?? null,
    scorers: (r.scorers as GameScorers) ?? null,
  };
}

export async function listGames(brandKey: string, leagueSlug: string): Promise<LeagueGame[]> {
  const { data } = await supabaseAdmin().from('site_league_games').select(COLS).eq('brand_key', brandKey).eq('league_slug', leagueSlug).order('starts_at', { ascending: true, nullsFirst: false });
  return (data ?? []).map(toGame);
}

/** Standings per division from final games: wins, then point difference, then points for. */
export function standings(games: LeagueGame[]): Map<string, StandingRow[]> {
  const out = new Map<string, Map<string, StandingRow>>();
  const row = (div: string, team: string) => {
    const d = out.get(div) ?? new Map<string, StandingRow>();
    out.set(div, d);
    const r = d.get(team) ?? { team, gp: 0, w: 0, l: 0, pf: 0, pa: 0, diff: 0, pct: 0 };
    d.set(team, r);
    return r;
  };
  for (const g of games) {
    row(g.division, g.home); row(g.division, g.away);
    if (g.status !== 'final' || g.homeScore == null || g.awayScore == null) continue;
    const h = row(g.division, g.home), a = row(g.division, g.away);
    h.gp++; a.gp++; h.pf += g.homeScore; h.pa += g.awayScore; a.pf += g.awayScore; a.pa += g.homeScore;
    if (g.homeScore > g.awayScore) { h.w++; a.l++; } else if (g.awayScore > g.homeScore) { a.w++; h.l++; }
  }
  const result = new Map<string, StandingRow[]>();
  for (const [div, d] of out) {
    const rows = [...d.values()].map((r) => ({ ...r, diff: r.pf - r.pa, pct: r.gp ? r.w / r.gp : 0 }));
    rows.sort((x, y) => y.w - x.w || y.diff - x.diff || y.pf - x.pf || x.team.localeCompare(y.team));
    result.set(div, rows);
  }
  return result;
}

export const divisionsOf = (games: LeagueGame[]) => [...new Set(games.map((g) => g.division))].sort();

/** A <input type="datetime-local"> value typed as Toronto time -> ISO (handles EST/EDT). */
export function torontoLocalToIso(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - ms) / 60000;
  };
  let utc = guess - offsetAt(guess) * 60000;
  const o2 = offsetAt(utc);
  if (o2 !== offsetAt(guess)) utc = guess - o2 * 60000;
  return new Date(utc).toISOString();
}

export interface LeagueTeam { id: number; name: string; shortName: string | null; city: string | null; logoUrl: string | null }

export async function listTeams(brandKey: string, leagueSlug: string): Promise<LeagueTeam[]> {
  const { data } = await supabaseAdmin().from('site_league_teams').select('id, name, short_name, city, logo_url').eq('brand_key', brandKey).eq('league_slug', leagueSlug).order('name');
  return (data ?? []).map((r) => ({ id: r.id as number, name: r.name as string, shortName: (r.short_name as string) ?? null, city: (r.city as string) ?? null, logoUrl: (r.logo_url as string) ?? null }));
}

/** Upsert a team's logo / short name by its name as it appears in the games. */
export async function saveTeam(brandKey: string, leagueSlug: string, input: { name: string; shortName?: string; city?: string; logoUrl?: string | null }, actorClerkId: string): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('Team name is needed.');
  const row: Record<string, unknown> = { brand_key: brandKey, league_slug: leagueSlug, name };
  if (input.shortName !== undefined) row.short_name = input.shortName.trim() || null;
  if (input.city !== undefined) row.city = input.city.trim() || null;
  if (input.logoUrl !== undefined) row.logo_url = input.logoUrl;
  const { error } = await supabaseAdmin().from('site_league_teams').upsert(row, { onConflict: 'brand_key,league_slug,name' });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'site.league.team', target: `site:${brandKey}`, meta: { league: leagueSlug, name, logo: !!input.logoUrl } });
}

export interface GameInput { id?: number; leagueSlug: string; division: string; startsAt: string | null; venue: string; home: string; away: string; homeScore: number | null; awayScore: number | null; status: GameStatus; note: string; scorers?: GameScorers | null }

/** "Name | points" lines (or "Name 23") -> scorers, top five by points. */
export function parseScorers(text: string): Scorer[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)[\s|,:-]+(\d{1,3})\s*$/);
    return m ? { name: m[1].trim(), pts: Number(m[2]) } : { name: l, pts: 0 };
  }).filter((s) => s.name).sort((a, b) => b.pts - a.pts).slice(0, 5);
}

export async function saveGame(brandKey: string, input: GameInput, actorClerkId: string): Promise<void> {
  if (!input.home.trim() || !input.away.trim()) throw new Error('Both teams are needed.');
  const row = {
    brand_key: brandKey, league_slug: input.leagueSlug, division: input.division.trim(), starts_at: input.startsAt, venue: input.venue.trim() || null,
    home: input.home.trim(), away: input.away.trim(), home_score: input.homeScore, away_score: input.awayScore,
    status: input.homeScore != null && input.awayScore != null && input.status !== 'postponed' ? 'final' : input.status, note: input.note.trim() || null, updated_at: new Date().toISOString(),
    ...(input.scorers !== undefined ? { scorers: input.scorers } : {}),
  };
  const db = supabaseAdmin();
  const { error } = input.id ? await db.from('site_league_games').update(row).eq('brand_key', brandKey).eq('id', input.id) : await db.from('site_league_games').insert({ ...row, created_by: actorClerkId });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: input.id ? 'site.league.game.update' : 'site.league.game.add', target: `site:${brandKey}`, meta: { league: input.leagueSlug, home: row.home, away: row.away, status: row.status } });
}

export async function deleteGame(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  await supabaseAdmin().from('site_league_games').delete().eq('brand_key', brandKey).eq('id', id);
  await audit({ actorId: actorClerkId, action: 'site.league.game.delete', target: `site:${brandKey}`, meta: { id } });
}
