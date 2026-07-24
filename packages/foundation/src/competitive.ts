/**
 * Competitive Play engine (Module 6) - PURE, edge-safe, deterministic +
 * explainable. Forward = balancing draft; reverse = replacement suggester;
 * plus round-robin scheduling with soft time-slot balancing, and sport-aware
 * standings. Used by Leagues (M7), Tournaments (M9), competitive Camps (M8).
 */

// ---------------------------------------------------------------------------
// Player model + balancing draft
// ---------------------------------------------------------------------------

export type BalanceAttribute = 'age' | 'gender' | 'skill' | 'experience' | 'height';

export interface DraftPlayer {
  id: number;
  /** Numeric/categorical attributes from registration custom questions. */
  age?: number;
  gender?: string;
  skill?: number;      // 1..10
  experience?: number; // years
  height?: number;     // cm
  jerseySize?: string;
  /** Locked to a specific team index (captains/coach assignment). */
  lockedTeam?: number;
  /** Small-group key: members with the same key stay together. */
  groupKey?: string;
}

export interface DraftResult {
  teams: number[][];               // player ids per team index
  /** Per-team average of each balanced numeric attribute (explainability). */
  teamAverages: Record<BalanceAttribute, number>[];
  /** Spread (max-min of team averages) per attribute; lower = better balanced. */
  spread: Partial<Record<BalanceAttribute, number>>;
}

const NUMERIC: BalanceAttribute[] = ['age', 'skill', 'experience', 'height'];

/** Composite "strength" for ordering groups (sum of checked numeric attrs). */
function groupStrength(members: DraftPlayer[], attrs: BalanceAttribute[]): number {
  return members.reduce((sum, p) => sum + attrs.filter((a) => a !== 'gender').reduce((s, a) => s + (Number(p[a]) || 0), 0), 0);
}

/**
 * Distribute players across `numTeams`, balancing the CHECKED attributes
 * simultaneously. Locked players are placed first; grouped players stay
 * together; the rest are placed greedily (biggest/strongest groups first into
 * the currently-lightest team). Deterministic for a given input order.
 */
export function balanceDraft(players: DraftPlayer[], numTeams: number, attributes: BalanceAttribute[]): DraftResult {
  if (numTeams < 1) throw new Error('numTeams must be >= 1');
  const teams: DraftPlayer[][] = Array.from({ length: numTeams }, () => []);

  // 1. Locked players.
  const unlocked: DraftPlayer[] = [];
  for (const p of players) {
    if (p.lockedTeam != null && p.lockedTeam >= 0 && p.lockedTeam < numTeams) teams[p.lockedTeam].push(p);
    else unlocked.push(p);
  }

  // 2. Group the unlocked (groupKey stays together; singletons are their own group).
  const groupMap = new Map<string, DraftPlayer[]>();
  let solo = 0;
  for (const p of unlocked) {
    const key = p.groupKey ?? `__solo_${solo++}`;
    groupMap.set(key, [...(groupMap.get(key) ?? []), p]);
  }
  const groups = [...groupMap.values()];

  // 3. Order: larger groups first, then stronger, then by first id (stable).
  groups.sort((a, b) => b.length - a.length || groupStrength(b, attributes) - groupStrength(a, attributes) || a[0].id - b[0].id);

  // Running per-team load for the checked numeric attrs + gender counts.
  const load = teams.map((t) => sumLoad(t, attributes));
  const genderCounts = teams.map((t) => countGender(t));

  // 4. Greedy placement: each group to the team that keeps balance tightest.
  for (const group of groups) {
    let bestTeam = 0;
    let bestCost = Infinity;
    for (let i = 0; i < numTeams; i++) {
      // Cost = resulting team size (favor fewer) weighted + numeric load + gender skew.
      const size = teams[i].length + group.length;
      const gStrength = groupStrength(group, attributes);
      const numericCost = load[i] + gStrength;
      const genderCost = attributes.includes('gender') ? genderSkew(genderCounts[i], group) : 0;
      const cost = size * 1000 + numericCost + genderCost;
      if (cost < bestCost) { bestCost = cost; bestTeam = i; }
    }
    teams[bestTeam].push(...group);
    load[bestTeam] += groupStrength(group, attributes);
    genderCounts[bestTeam] = countGender(teams[bestTeam]);
  }

  // 5. Report.
  const teamAverages = teams.map((t) => averages(t));
  const spread: Partial<Record<BalanceAttribute, number>> = {};
  for (const a of attributes) {
    if (a === 'gender') continue;
    const vals = teamAverages.map((av) => av[a]);
    spread[a] = Math.round((Math.max(...vals) - Math.min(...vals)) * 100) / 100;
  }
  return { teams: teams.map((t) => t.map((p) => p.id)), teamAverages, spread };
}

function sumLoad(team: DraftPlayer[], attrs: BalanceAttribute[]): number {
  return groupStrength(team, attrs);
}
function countGender(team: DraftPlayer[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const p of team) if (p.gender) c[p.gender] = (c[p.gender] ?? 0) + 1;
  return c;
}
function genderSkew(current: Record<string, number>, group: DraftPlayer[]): number {
  const next = { ...current };
  for (const p of group) if (p.gender) next[p.gender] = (next[p.gender] ?? 0) + 1;
  const vals = Object.values(next);
  return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
}
function averages(team: DraftPlayer[]): Record<BalanceAttribute, number> {
  const out = { age: 0, gender: 0, skill: 0, experience: 0, height: 0 } as Record<BalanceAttribute, number>;
  if (team.length === 0) return out;
  for (const a of NUMERIC) {
    const vals = team.map((p) => Number(p[a]) || 0);
    out[a] = Math.round((vals.reduce((s, v) => s + v, 0) / team.length) * 100) / 100;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reverse mode: replacement suggester (on player drop)
// ---------------------------------------------------------------------------

export interface ReplacementCandidate {
  playerId: number;
  fromTeam: number;
  jerseyMatch: boolean;
  skillDelta: number;      // |candidate.skill - dropped.skill|
  balanceImpact: number;   // lower = less disruptive
  score: number;           // ranking score (lower = better)
}

/**
 * On a drop from `teamNeedingPlayer`, rank up to 5 replacements from OTHER
 * teams: prefer matching jersey size, similar skill, and minimal disruption to
 * the donor team's balance. Recommend-only - staff approve the swap.
 */
export function suggestReplacements(
  dropped: DraftPlayer,
  teams: DraftPlayer[][],
  teamNeedingPlayer: number,
  limit = 5,
): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = [];
  for (let t = 0; t < teams.length; t++) {
    if (t === teamNeedingPlayer) continue;
    if (teams[t].length <= 1) continue; // donor can't go empty
    for (const p of teams[t]) {
      const jerseyMatch = !!dropped.jerseySize && p.jerseySize === dropped.jerseySize;
      const skillDelta = Math.abs((p.skill ?? 0) - (dropped.skill ?? 0));
      // Disruption: how much removing p shifts the donor team's average skill.
      const before = avgSkill(teams[t]);
      const after = avgSkill(teams[t].filter((x) => x.id !== p.id));
      const balanceImpact = Math.round(Math.abs(before - after) * 100) / 100;
      const score = (jerseyMatch ? 0 : 5) + skillDelta + balanceImpact;
      candidates.push({ playerId: p.id, fromTeam: t, jerseyMatch, skillDelta, balanceImpact, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.playerId - b.playerId);
  return candidates.slice(0, limit);
}
function avgSkill(team: DraftPlayer[]): number {
  if (team.length === 0) return 0;
  return team.reduce((s, p) => s + (p.skill ?? 0), 0) / team.length;
}

// ---------------------------------------------------------------------------
// Round-robin schedule + soft time-slot balancing
// ---------------------------------------------------------------------------

export interface RoundRobinGame {
  round: number;
  home: number; // team index
  away: number;
}

/** Circle-method round robin. rounds = (n-1) single, 2(n-1) double. */
export function roundRobin(numTeams: number, doubleRound = false): RoundRobinGame[] {
  const n = numTeams % 2 === 0 ? numTeams : numTeams + 1; // pad with a bye slot if odd
  const teams = Array.from({ length: n }, (_, i) => i);
  // When padded (odd), the extra index === numTeams is the "bye"; the
  // a<numTeams && b<numTeams guard drops any game involving it. For even n
  // every index is a real team.
  const games: RoundRobinGame[] = [];
  const roundsPer = n - 1;

  let arr = [...teams];
  for (let r = 0; r < roundsPer; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a < numTeams && b < numTeams) {
        // Alternate home/away by round for fairness.
        games.push(r % 2 === 0 ? { round: r + 1, home: a, away: b } : { round: r + 1, home: b, away: a });
      }
    }
    // rotate (keep first fixed)
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  if (doubleRound) {
    const second = games.map((g) => ({ round: g.round + roundsPer, home: g.away, away: g.home }));
    return [...games, ...second];
  }
  return games;
}

export interface SlotAssignment extends RoundRobinGame {
  timeSlot: string;
  court: number;
}

/**
 * Assign each round-robin game a time slot + court, softly balancing so each
 * team gets a similar count of each slot. Deterministic; returns games with
 * slots plus the per-team slot distribution for the overview panel.
 */
export function assignSlots(
  games: RoundRobinGame[],
  timeSlots: string[],
  numCourts: number,
): { games: SlotAssignment[]; distribution: Record<number, Record<string, number>> } {
  const dist: Record<number, Record<string, number>> = {};
  const bump = (team: number, slot: string) => { (dist[team] ??= {})[slot] = (dist[team][slot] ?? 0) + 1; };
  const teamSlot = (team: number, slot: string) => dist[team]?.[slot] ?? 0;

  const out: SlotAssignment[] = [];
  let court = 0;
  for (const g of games) {
    // Choose the slot minimizing the two teams' combined count of that slot.
    let bestSlot = timeSlots[0];
    let bestCost = Infinity;
    for (const slot of timeSlots) {
      const cost = teamSlot(g.home, slot) + teamSlot(g.away, slot);
      if (cost < bestCost) { bestCost = cost; bestSlot = slot; }
    }
    out.push({ ...g, timeSlot: bestSlot, court: court % Math.max(1, numCourts) });
    bump(g.home, bestSlot); bump(g.away, bestSlot);
    court++;
  }
  return { games: out, distribution: dist };
}

// ---------------------------------------------------------------------------
// Single-elimination bracket (Tournament championship mode)
// ---------------------------------------------------------------------------

export interface BracketMatch {
  round: number;      // 1 = first round
  slot: number;       // position within the round
  seedA: number | null; // team seed (1-based) or null = TBD/from prior round
  seedB: number | null; // null with a non-null seedA in round 1 = BYE
}

/**
 * Standard-seeded single-elimination bracket. Pads to the next power of two
 * with byes given to the top seeds. Returns round-1 matchups plus the total
 * round count (later rounds fill from winners).
 */
export function singleElimination(numTeams: number): { rounds: number; firstRound: BracketMatch[] } {
  if (numTeams < 2) return { rounds: 0, firstRound: [] };
  const size = 2 ** Math.ceil(Math.log2(numTeams));
  const rounds = Math.log2(size);

  // Standard bracket seeding order for `size` slots (1-indexed seeds).
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) { next.push(s); next.push(n + 1 - s); }
    order = next;
  }

  const firstRound: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const a = order[i] <= numTeams ? order[i] : null;      // real seed or null
    const b = order[i + 1] <= numTeams ? order[i + 1] : null;
    firstRound.push({ round: 1, slot: i / 2, seedA: a, seedB: b }); // b===null => A gets a bye
  }
  return { rounds, firstRound };
}

// ---------------------------------------------------------------------------
// Standings (sport-aware)
// ---------------------------------------------------------------------------

export interface GameResult {
  homeTeam: number;
  awayTeam: number;
  homeScore: number;
  awayScore: number;
}

export interface StandingRow {
  team: number;
  gp: number; w: number; l: number; winPct: number;
  pf: number; pa: number; diff: number;
  streak: string;      // e.g. "W3", "L1"
  gamesBehind: number;
}

export type Sport = 'basketball' | 'volleyball' | 'other';

export const DEFAULT_TIEBREAKS: Record<Sport, string[]> = {
  basketball: ['wins', 'head_to_head', 'differential'],
  volleyball: ['wins', 'head_to_head', 'differential'],
  other: ['wins', 'head_to_head', 'win_pct'],
};

/** Compute standings from final results. `pf/pa` = points or sets per sport. */
export function computeStandings(results: GameResult[], teamIds: number[], tiebreaks: string[] = DEFAULT_TIEBREAKS.other): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  const streaks = new Map<number, string[]>();
  for (const t of teamIds) { rows.set(t, { team: t, gp: 0, w: 0, l: 0, winPct: 0, pf: 0, pa: 0, diff: 0, streak: '', gamesBehind: 0 }); streaks.set(t, []); }

  const h2h = new Map<string, number>(); // "a:b" -> a's wins over b
  for (const g of results) {
    const home = rows.get(g.homeTeam); const away = rows.get(g.awayTeam);
    if (!home || !away) continue;
    home.gp++; away.gp++;
    home.pf += g.homeScore; home.pa += g.awayScore;
    away.pf += g.awayScore; away.pa += g.homeScore;
    const homeWon = g.homeScore > g.awayScore;
    if (homeWon) { home.w++; away.l++; streaks.get(g.homeTeam)!.push('W'); streaks.get(g.awayTeam)!.push('L'); h2h.set(`${g.homeTeam}:${g.awayTeam}`, (h2h.get(`${g.homeTeam}:${g.awayTeam}`) ?? 0) + 1); }
    else { away.w++; home.l++; streaks.get(g.awayTeam)!.push('W'); streaks.get(g.homeTeam)!.push('L'); h2h.set(`${g.awayTeam}:${g.homeTeam}`, (h2h.get(`${g.awayTeam}:${g.homeTeam}`) ?? 0) + 1); }
  }

  for (const [t, row] of rows) {
    row.diff = row.pf - row.pa;
    row.winPct = row.gp ? Math.round((row.w / row.gp) * 1000) / 1000 : 0;
    const s = streaks.get(t)!;
    if (s.length) { let k = 1; for (let i = s.length - 2; i >= 0 && s[i] === s[s.length - 1]; i--) k++; row.streak = `${s[s.length - 1]}${k}`; }
  }

  const cmp = (a: StandingRow, b: StandingRow): number => {
    for (const tb of tiebreaks) {
      let d = 0;
      if (tb === 'wins') d = b.w - a.w;
      else if (tb === 'win_pct') d = b.winPct - a.winPct;
      else if (tb === 'differential') d = b.diff - a.diff;
      else if (tb === 'head_to_head') d = (h2h.get(`${b.team}:${a.team}`) ?? 0) - (h2h.get(`${a.team}:${b.team}`) ?? 0);
      if (d !== 0) return d;
    }
    return a.team - b.team;
  };
  const sorted = [...rows.values()].sort(cmp);
  const leaderWins = sorted[0]?.w ?? 0;
  const leaderLoss = sorted[0]?.l ?? 0;
  for (const row of sorted) row.gamesBehind = Math.max(0, ((leaderWins - row.w) + (row.l - leaderLoss)) / 2);
  return sorted;
}
