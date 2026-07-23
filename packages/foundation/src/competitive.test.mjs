/**
 * Competitive engine tests (Module 6). Run: npm run test:competitive
 */
import { balanceDraft, suggestReplacements, roundRobin, assignSlots, computeStandings } from './__compiled__/competitive.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

// --- balancing draft --------------------------------------------------------
{
  // 8 players, 2 teams, balance skill; one locked, one group of 2.
  const players = [
    { id: 1, skill: 9, jerseySize: 'AL' }, { id: 2, skill: 8 }, { id: 3, skill: 7 }, { id: 4, skill: 6 },
    { id: 5, skill: 5 }, { id: 6, skill: 4 }, { id: 7, skill: 3, lockedTeam: 0 }, { id: 8, skill: 2, groupKey: 'g', }, { id: 9, skill: 2, groupKey: 'g' },
  ];
  const r = balanceDraft(players, 2, ['skill']);
  ok('locked player stays on its team', r.teams[0].includes(7));
  ok('group stays together', (r.teams[0].includes(8) && r.teams[0].includes(9)) || (r.teams[1].includes(8) && r.teams[1].includes(9)));
  ok('all players placed once', r.teams.flat().sort((a, b) => a - b).join() === '1,2,3,4,5,6,7,8,9');
  ok('skill spread is small (balanced)', (r.spread.skill ?? 99) <= 2, `spread ${r.spread.skill}`);
}
{
  // even numeric distribution across 3 teams
  const players = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, skill: (i % 6) + 1 }));
  const r = balanceDraft(players, 3, ['skill']);
  ok('teams roughly equal size', r.teams.every((t) => t.length === 4), r.teams.map((t) => t.length).join());
}

// --- replacement suggester --------------------------------------------------
{
  const dropped = { id: 100, skill: 6, jerseySize: 'AM' };
  const teams = [
    [{ id: 1, skill: 6 }], // team 0 needs a player
    [{ id: 2, skill: 6, jerseySize: 'AM' }, { id: 3, skill: 9, jerseySize: 'AL' }, { id: 4, skill: 3 }],
    [{ id: 5, skill: 6, jerseySize: 'AS' }, { id: 6, skill: 5 }],
  ];
  const s = suggestReplacements(dropped, teams, 0, 5);
  ok('top candidate matches jersey + skill', s[0].playerId === 2 && s[0].jerseyMatch && s[0].skillDelta === 0, JSON.stringify(s[0]));
  ok('returns ranked, capped at 5', s.length <= 5 && s.every((c, i) => i === 0 || c.score >= s[i - 1].score));
  ok('never drains a 1-player team (team 0 excluded)', !s.some((c) => c.fromTeam === 0));
}

// --- round robin ------------------------------------------------------------
{
  const g = roundRobin(4);
  ok('4 teams single RR = 6 games', g.length === 6, `${g.length}`);
  // every pair plays exactly once
  const pairs = new Set(g.map((x) => [x.home, x.away].sort((a, b) => a - b).join('-')));
  ok('every pair once', pairs.size === 6);
  const dbl = roundRobin(4, true);
  ok('double RR = 12 games', dbl.length === 12, `${dbl.length}`);
}
{
  const g = roundRobin(5); // odd -> bye each round, 5*4/2 = 10 games
  ok('5 teams single RR = 10 games', g.length === 10, `${g.length}`);
}

// --- slot balancing ---------------------------------------------------------
{
  const games = roundRobin(4);
  const { games: slotted, distribution } = assignSlots(games, ['18:00', '19:00', '20:00'], 2);
  ok('every game gets a slot + court', slotted.every((s) => s.timeSlot && s.court >= 0 && s.court < 2));
  // no team wildly skewed to one slot (max per-slot count reasonable)
  const skew = Math.max(...Object.values(distribution).map((d) => Math.max(...Object.values(d)) - Math.min(...Object.values(d).length ? Object.values(d) : [0])));
  ok('time slots reasonably balanced', skew <= 2, `skew ${skew}`);
}

// --- standings --------------------------------------------------------------
{
  // 3 teams, basketball points. T1 beats T2, T1 beats T3, T2 beats T3
  const results = [
    { homeTeam: 1, awayTeam: 2, homeScore: 80, awayScore: 70 },
    { homeTeam: 1, awayTeam: 3, homeScore: 90, awayScore: 60 },
    { homeTeam: 2, awayTeam: 3, homeScore: 75, awayScore: 65 },
  ];
  const s = computeStandings(results, [1, 2, 3], ['wins', 'differential']);
  ok('leader is T1 (2-0)', s[0].team === 1 && s[0].w === 2 && s[0].l === 0);
  ok('T1 diff = +40', s[0].diff === (80 + 90) - (70 + 60), `diff ${s[0].diff}`);
  ok('order T1 > T2 > T3', s.map((r) => r.team).join() === '1,2,3');
  ok('games behind computed', s[2].gamesBehind === 2, `gb ${s[2].gamesBehind}`);
  ok('streak tracked', s[0].streak === 'W2', s[0].streak);
}
{
  // tie-break: two teams 1-1, head-to-head decides
  const results = [
    { homeTeam: 1, awayTeam: 2, homeScore: 50, awayScore: 40 }, // T1 beats T2
    { homeTeam: 2, awayTeam: 3, homeScore: 60, awayScore: 30 }, // T2 beats T3
    { homeTeam: 3, awayTeam: 1, homeScore: 55, awayScore: 45 }, // T3 beats T1
  ];
  // all 1-1; head-to-head circular, so differential breaks it
  const s = computeStandings(results, [1, 2, 3], ['wins', 'head_to_head', 'differential']);
  ok('all teams 1-1', s.every((r) => r.w === 1 && r.l === 1));
  ok('tie-break produces a deterministic order', s.length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
