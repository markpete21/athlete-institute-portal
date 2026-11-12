import type { BoxLine } from './boxscore';

/**
 * Season numbers for a site-run league, computed from the published games'
 * stat lines: per-player averages and game logs, per-team totals, and
 * leaders. Pure (no I/O) so it is unit-tested. A player is keyed by
 * division + team + jersey number: the roster id is not required, so the
 * other team's players get pages too.
 */
export interface SeasonLine extends BoxLine { gameId: number; team: string; division: string }
export interface SeasonGame { id: number; division: string; home: string; away: string; homeScore: number | null; awayScore: number | null; startsAt: string | null }

export interface GameLogRow { gameId: number; startsAt: string | null; opponent: string; home: boolean; result: string; line: SeasonLine }
export interface PlayerSeason {
  slug: string; division: string; team: string; number: string | null; name: string;
  gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number;
  fgPct: number | null; tpPct: number | null; ftPct: number | null;
  high: { pts: number; reb: number; ast: number };
  log: GameLogRow[];
}
export interface TeamSeason {
  slug: string; division: string; team: string; gp: number; w: number; l: number;
  ppg: number; oppPpg: number; rpg: number; apg: number; spg: number; bpg: number; tpg: number;
  fgPct: number | null; tpPct: number | null; ftPct: number | null;
}

const slugPart = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const playerSlug = (division: string, team: string, number: string | null, name: string | null) => [slugPart(division), slugPart(team), number ? slugPart(number) : `n-${slugPart(name ?? 'player')}`].filter(Boolean).join('-');
export const teamSlug = (division: string, team: string) => [slugPart(team), slugPart(division)].filter(Boolean).join('-');

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (m: number, a: number) => (a > 0 ? r1((m / a) * 100) : null);
const n0 = (v: number | null | undefined) => v ?? 0;

export function playerSeasons(lines: SeasonLine[], games: SeasonGame[]): PlayerSeason[] {
  const byGame = new Map(games.map((g) => [g.id, g]));
  const out = new Map<string, PlayerSeason>();
  for (const l of lines) {
    if (l.isTotal) continue;
    const g = byGame.get(l.gameId);
    if (!g) continue;
    const slug = playerSlug(l.division, l.team, l.number, l.name);
    const p = out.get(slug) ?? { slug, division: l.division, team: l.team, number: l.number, name: l.name ?? (l.number ? `#${l.number}` : 'Player'), gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, fgPct: null, tpPct: null, ftPct: null, high: { pts: 0, reb: 0, ast: 0 }, log: [] };
    if (l.name && (p.name.startsWith('#') || p.name === 'Player')) p.name = l.name;
    p.gp += 1; p.pts += l.pts; p.reb += l.reb; p.ast += l.ast; p.stl += n0(l.stl); p.blk += n0(l.blk); p.tov += n0(l.tov);
    p.fgm += n0(l.fgm); p.fga += n0(l.fga); p.tpm += n0(l.tpm); p.tpa += n0(l.tpa); p.ftm += n0(l.ftm); p.fta += n0(l.fta);
    p.high = { pts: Math.max(p.high.pts, l.pts), reb: Math.max(p.high.reb, l.reb), ast: Math.max(p.high.ast, l.ast) };
    const home = g.home === l.team;
    const us = home ? g.homeScore : g.awayScore, them = home ? g.awayScore : g.homeScore;
    p.log.push({ gameId: g.id, startsAt: g.startsAt, opponent: home ? g.away : g.home, home, result: us != null && them != null ? `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}` : '', line: l });
    out.set(slug, p);
  }
  for (const p of out.values()) {
    p.ppg = r1(p.pts / p.gp); p.rpg = r1(p.reb / p.gp); p.apg = r1(p.ast / p.gp); p.spg = r1(p.stl / p.gp); p.bpg = r1(p.blk / p.gp);
    p.fgPct = pct(p.fgm, p.fga); p.tpPct = pct(p.tpm, p.tpa); p.ftPct = pct(p.ftm, p.fta);
    p.log.sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));
  }
  return [...out.values()].sort((a, b) => b.ppg - a.ppg || b.pts - a.pts || a.name.localeCompare(b.name));
}

/** Team season lines from the TEAM rows (or the players summed when a game has none). */
export function teamSeasons(lines: SeasonLine[], games: SeasonGame[]): TeamSeason[] {
  const byGame = new Map(games.map((g) => [g.id, g]));
  type Acc = { division: string; team: string; gp: number; w: number; l: number; pts: number; opp: number; reb: number; ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number };
  const acc = new Map<string, Acc>();
  const perGameTeam = new Map<string, SeasonLine[]>();
  for (const l of lines) perGameTeam.set(`${l.gameId}|${l.team}`, [...(perGameTeam.get(`${l.gameId}|${l.team}`) ?? []), l]);
  for (const [key, ls] of perGameTeam) {
    const g = byGame.get(Number(key.split('|')[0]));
    if (!g) continue;
    const team = ls[0].team, division = ls[0].division;
    const tot = ls.find((l) => l.isTotal);
    const sum = (k: keyof BoxLine) => (tot ? n0(tot[k] as number | null) : ls.filter((l) => !l.isTotal).reduce((a, l) => a + n0(l[k] as number | null), 0));
    const a = acc.get(teamSlug(division, team)) ?? { division, team, gp: 0, w: 0, l: 0, pts: 0, opp: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
    const home = g.home === team;
    const us = home ? g.homeScore : g.awayScore, them = home ? g.awayScore : g.homeScore;
    a.gp += 1; if (us != null && them != null) { if (us > them) a.w += 1; else if (us < them) a.l += 1; a.opp += them; }
    a.pts += us ?? sum('pts'); a.reb += sum('reb'); a.ast += sum('ast'); a.stl += sum('stl'); a.blk += sum('blk'); a.tov += sum('tov');
    a.fgm += sum('fgm'); a.fga += sum('fga'); a.tpm += sum('tpm'); a.tpa += sum('tpa'); a.ftm += sum('ftm'); a.fta += sum('fta');
    acc.set(teamSlug(division, team), a);
  }
  return [...acc.entries()].map(([slug, a]) => ({
    slug, division: a.division, team: a.team, gp: a.gp, w: a.w, l: a.l,
    ppg: r1(a.pts / a.gp), oppPpg: r1(a.opp / a.gp), rpg: r1(a.reb / a.gp), apg: r1(a.ast / a.gp), spg: r1(a.stl / a.gp), bpg: r1(a.blk / a.gp), tpg: r1(a.tov / a.gp),
    fgPct: pct(a.fgm, a.fga), tpPct: pct(a.tpm, a.tpa), ftPct: pct(a.ftm, a.fta),
  })).sort((x, y) => x.division.localeCompare(y.division) || y.ppg - x.ppg);
}

export interface LeaderBoard { key: string; label: string; unit: string; rows: { player: PlayerSeason; value: number }[] }

/**
 * Leaders per stat: averages for the counting stats, percentages with a
 * minimum number of attempts so one made shot does not lead the league.
 */
export function leaders(players: PlayerSeason[], n = 5): LeaderBoard[] {
  const minGp = Math.max(1, Math.ceil(Math.max(0, ...players.map((p) => p.gp)) / 2));
  const top = (pick: (p: PlayerSeason) => number | null, ok: (p: PlayerSeason) => boolean) =>
    players.filter(ok).map((p) => ({ player: p, value: pick(p) })).filter((r): r is { player: PlayerSeason; value: number } => r.value != null && r.value > 0).sort((a, b) => b.value - a.value || b.player.gp - a.player.gp).slice(0, n);
  const played = (p: PlayerSeason) => p.gp >= minGp;
  return [
    { key: 'ppg', label: 'Points', unit: 'per game', rows: top((p) => p.ppg, played) },
    { key: 'rpg', label: 'Rebounds', unit: 'per game', rows: top((p) => p.rpg, played) },
    { key: 'apg', label: 'Assists', unit: 'per game', rows: top((p) => p.apg, played) },
    { key: 'spg', label: 'Steals', unit: 'per game', rows: top((p) => p.spg, played) },
    { key: 'bpg', label: 'Blocks', unit: 'per game', rows: top((p) => p.bpg, played) },
    { key: 'tpm', label: 'Threes made', unit: 'total', rows: top((p) => p.tpm, () => true) },
    { key: 'fg', label: 'Field goal %', unit: `min ${3 * minGp} attempts`, rows: top((p) => p.fgPct, (p) => p.fga >= 3 * minGp) },
    { key: 'ft', label: 'Free throw %', unit: `min ${2 * minGp} attempts`, rows: top((p) => p.ftPct, (p) => p.fta >= 2 * minGp) },
  ].filter((b) => b.rows.length > 0);
}

/** Best single-game lines of the season (for the leaders page). */
export function seasonHighs(players: PlayerSeason[], n = 5): { label: string; rows: { player: PlayerSeason; value: number; game: GameLogRow }[] }[] {
  const all = players.flatMap((p) => p.log.map((g) => ({ player: p, game: g })));
  const best = (k: 'pts' | 'reb' | 'ast') => [...all].sort((a, b) => b.game.line[k] - a.game.line[k]).slice(0, n).filter((r) => r.game.line[k] > 0).map((r) => ({ ...r, value: r.game.line[k] }));
  return [{ label: 'Points in a game', rows: best('pts') }, { label: 'Rebounds in a game', rows: best('reb') }, { label: 'Assists in a game', rows: best('ast') }].filter((b) => b.rows.length > 0);
}
