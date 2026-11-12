import type { BoxLine } from '../site/boxscore';
import type { SsBoxPlayer, SsBoxScore, SsEvent, SsMatch, SsTeam, SsTotals } from './types';

/**
 * Pure mapping between Superstat's API and the site-run league tables: box
 * score -> stat lines, a Superstat match -> a scheduled game, Superstat
 * teams -> Circuit teams. No I/O, so it is unit-tested with the sample
 * payloads from Superstat's docs.
 */
const baseLine = (): BoxLine => ({ number: null, name: null, isTotal: false, pts: 0, reb: 0, ast: 0, stl: null, blk: null, tov: null, fgm: null, fga: null, tpm: null, tpa: null, ftm: null, fta: null, oreb: null, dreb: null, pf: null, min: null });

function fromTotals(t: SsTotals): BoxLine {
  return {
    ...baseLine(), pts: t.points ?? 0, reb: t.rebounds ?? 0, ast: t.assists ?? 0, stl: t.steals ?? null, blk: t.blocks ?? null, tov: t.turnovers ?? null,
    fgm: t.fieldGoalsMade ?? null, fga: t.fieldGoalsAttempted ?? null, tpm: t.threePointersMade ?? null, tpa: t.threePointersAttempted ?? null, ftm: t.freeThrowsMade ?? null, fta: t.freeThrowsAttempted ?? null,
    oreb: t.offensiveRebounds ?? null, dreb: t.defensiveRebounds ?? null, pf: t.fouls ?? null,
  };
}

export interface MappedPlayerLine extends BoxLine { superstatPlayerId: string | null }
export interface MappedSide { name: string; lines: MappedPlayerLine[]; total: BoxLine }

const playerLine = (p: SsBoxPlayer): MappedPlayerLine => ({
  ...fromTotals(p), number: p.jerseyNumber ? String(p.jerseyNumber).replace(/^#/, '') : null, name: p.name?.trim() || null,
  min: p.minutes != null ? String(p.minutes) : null, superstatPlayerId: p.playerId ?? null,
});

/** Superstat box score -> our lines for both sides (players by points, then a TEAM row). */
export function boxScoreToSides(box: SsBoxScore): { team: MappedSide; opponent: MappedSide } {
  const side = (s: SsBoxScore['team']): MappedSide => ({
    name: s.name,
    lines: (s.players ?? []).map(playerLine).sort((a, b) => b.pts - a.pts || b.reb - a.reb || b.ast - a.ast),
    total: { ...fromTotals(s.totals), isTotal: true, name: 'TEAM' },
  });
  return { team: side(box.team), opponent: side(box.opponent) };
}

/** "u13" + "boys" -> matches a division label like "U13 Boys". */
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function teamFitsDivision(t: Pick<SsTeam, 'name' | 'ageGroup' | 'gender'>, division: string): boolean {
  const d = norm(division);
  if (!d) return true;
  const age = norm(t.ageGroup) || (norm(t.name).match(/\bu\s?(\d{1,2})\b/)?.[0].replace(/\s/g, '') ?? '');
  const dAge = d.match(/\bu\s?(\d{1,2})\b/)?.[0].replace(/\s/g, '') ?? '';
  if (age && dAge && age !== dAge) return false;
  const g = norm(t.gender), dg = /\bgirls?\b|\bwomen\b/.test(d) ? 'girls' : /\bboys?\b|\bmen\b/.test(d) ? 'boys' : '';
  if (g && dg && !g.startsWith(dg.slice(0, 3))) return false;
  return !!(age && dAge) || norm(t.name).includes(d);
}

/**
 * Suggest the Superstat team for a Circuit team in a division: its name
 * contains the club name (or the other way round) and the age group fits.
 */
export function suggestTeam(circuitTeam: string, division: string, ssTeams: SsTeam[]): SsTeam | null {
  const c = norm(circuitTeam);
  const hits = ssTeams.filter((t) => { const n = norm(t.name); return (n.includes(c) || c.split(' ').filter((w) => w.length > 3).every((w) => n.includes(w))) && teamFitsDivision(t, division); });
  return hits.length === 1 ? hits[0] : null;
}

export interface TeamLink { superstatTeamId: string; team: string; division: string }
export interface GameRef { id: number; division: string; home: string; away: string; startsAt: string | null; superstatMatchId?: string | null }

const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : '');
const dayGap = (a: string, b: string) => Math.abs((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

/**
 * Which scheduled game is this Superstat match? Its `team` (and, when the
 * other side is ours too, its `opponent`) map to Circuit teams; the game is
 * the one between them in that division on the same Toronto date (or the
 * closest within two days). Returns which Circuit team is Superstat's `team`.
 */
export function linkMatch(m: SsMatch, games: GameRef[], links: TeamLink[]): { gameId: number; teamName: string; opponentName: string } | null {
  const already = games.find((g) => g.superstatMatchId === m.id);
  const teamLink = links.find((l) => l.superstatTeamId === m.team.id);
  const oppLink = m.opponent.id ? links.find((l) => l.superstatTeamId === m.opponent.id) : undefined;
  const us = teamLink ?? oppLink;
  if (!us) return null;
  const involves = (g: GameRef, name: string) => g.home === name || g.away === name;
  const other = (g: GameRef, name: string) => (g.home === name ? g.away : g.home);
  const pool = already ? [already] : games.filter((g) => !g.superstatMatchId && g.division === us.division && involves(g, us.team) && (!teamLink || !oppLink || involves(g, oppLink.team)));
  const day = dayOf(m.playedAt);
  const ranked = pool.map((g) => ({ g, gap: day && g.startsAt ? dayGap(day, dayOf(g.startsAt)) : 99 })).filter((x) => already || x.gap <= 2).sort((a, b) => a.gap - b.gap);
  const best = ranked[0]?.g;
  if (!best) return null;
  // More than one game the same distance away (a double-header) and nothing else to tell them apart: don't guess.
  if (!already && ranked.length > 1 && ranked[1].gap === ranked[0].gap && !(teamLink && oppLink)) return null;
  const teamName = teamLink ? teamLink.team : other(best, oppLink!.team);
  return { gameId: best.id, teamName, opponentName: other(best, teamName) };
}

export interface EventRow { seq: number; type: string; success: boolean | null; team: string; number: string | null; name: string | null; periodNumber: number | null; periodType: string | null; periodSeconds: number | null; matchSeconds: number | null; x: number | null; y: number | null; customName: string | null }

/** Play-by-play events -> rows, with `side` resolved to the Circuit team name. */
export function eventsToRows(events: SsEvent[], teamName: string, opponentName: string): EventRow[] {
  return events.map((e, i) => ({
    seq: i, type: e.type, success: e.success ?? null, team: e.side === 'team' ? teamName : opponentName,
    number: e.player?.jerseyNumber ? String(e.player.jerseyNumber) : null, name: e.player?.name ?? null,
    periodNumber: e.periodNumber ?? null, periodType: e.periodType ?? null, periodSeconds: e.periodSeconds ?? null, matchSeconds: e.matchSeconds ?? null,
    x: e.location?.x ?? null, y: e.location?.y ?? null, customName: e.customEventName ?? null,
  }));
}
