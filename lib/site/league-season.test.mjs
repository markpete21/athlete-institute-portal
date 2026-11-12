/** Season aggregation tests (site-run league stats). Run: npm run test:season */
import { playerSeasons, teamSeasons, leaders, seasonHighs, playerSlug, teamSlug } from './__compiled__/league-season.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

const L = (gameId, team, number, name, pts, reb, ast, x = {}) => ({ gameId, team, division: 'U13 Boys', number, name, isTotal: false, pts, reb, ast, stl: 1, blk: 0, tov: 2, fgm: 4, fga: 8, tpm: 1, tpa: 3, ftm: 1, fta: 2, oreb: null, dreb: null, pf: null, min: null, ...x });
const T = (gameId, team, pts, reb, ast) => ({ ...L(gameId, team, null, 'TEAM', pts, reb, ast, { fgm: 20, fga: 50, tpm: 4, tpa: 12, ftm: 6, fta: 10, stl: 8, blk: 2, tov: 15 }), isTotal: true });
const games = [
  { id: 1, division: 'U13 Boys', home: 'Orangeville Bears', away: 'Woodbridge Lions', homeScore: 66, awayScore: 47, startsAt: '2026-11-04T23:30:00Z' },
  { id: 2, division: 'U13 Boys', home: 'Motion Kings', away: 'Orangeville Bears', homeScore: 50, awayScore: 44, startsAt: '2026-11-25T23:30:00Z' },
];
const lines = [
  L(1, 'Orangeville Bears', '15', 'Ava N', 14, 3, 2), L(1, 'Orangeville Bears', '6', 'Sam K', 10, 5, 6), T(1, 'Orangeville Bears', 66, 41, 13),
  L(1, 'Woodbridge Lions', '15', 'Other 15', 20, 9, 1), T(1, 'Woodbridge Lions', 47, 31, 7),
  L(2, 'Orangeville Bears', '15', 'Ava N', 22, 5, 4), L(2, 'Orangeville Bears', '6', null, 2, 1, 0),
];

const ps = playerSeasons(lines, games);
const ava = ps.find((p) => p.slug === 'u13-boys-orangeville-bears-15');
ok('same number on two teams are different players', ps.filter((p) => p.number === '15').length === 2);
ok('games played and totals', ava?.gp === 2 && ava.pts === 36 && ava.reb === 8 && ava.ast === 6);
ok('averages to one decimal', ava?.ppg === 18 && ava.rpg === 4 && ava.apg === 3);
ok('percentages', ava?.fgPct === 50 && ava.tpPct === 33.3 && ava.ftPct === 50);
ok('season highs per player', ava?.high.pts === 22 && ava.high.reb === 5);
ok('game log newest first with results', ava?.log[0].gameId === 2 && ava.log[0].result === 'L 44-50' && ava.log[0].opponent === 'Motion Kings' && ava.log[0].home === false && ava.log[1].result === 'W 66-47');
ok('a name missing in one game is kept from another', ps.find((p) => p.slug === 'u13-boys-orangeville-bears-6')?.name === 'Sam K');
ok('sorted by points per game', ps[0].name === 'Other 15' && ps[1].name === 'Ava N');
ok('slugs', playerSlug('U13 Boys', 'Orangeville Bears', '15', null) === 'u13-boys-orangeville-bears-15' && teamSlug('U13 Boys', 'Orangeville Bears') === 'orangeville-bears-u13-boys');
ok('no number: slug from the name', playerSlug('U13 Boys', 'Lions', null, 'Jo Smith') === 'u13-boys-lions-n-jo-smith');

const ts = teamSeasons(lines, games);
const bears = ts.find((t) => t.team === 'Orangeville Bears');
ok('team record and scoring from game scores', bears?.gp === 2 && bears.w === 1 && bears.l === 1 && bears.ppg === 55 && bears.oppPpg === 48.5);
ok('team rows used when present, players summed when not', bears?.rpg === 23.5, String(bears?.rpg));
ok('team percentages', ts.find((t) => t.team === 'Woodbridge Lions')?.fgPct === 40);

const lb = leaders(ps);
ok('points leaders, anyone with half the games played', lb.find((b) => b.key === 'ppg')?.rows.map((r) => r.player.name).join() === 'Other 15,Ava N,Sam K', lb.find((b) => b.key === 'ppg')?.rows.map((r) => r.player.name).join());
{
  // Four-game season: a one-game player no longer qualifies for the per-game boards.
  const g4 = [1, 2, 3, 4].map((id) => ({ id, division: 'U13 Boys', home: 'A', away: 'B', homeScore: 50, awayScore: 40, startsAt: `2026-11-0${id}T00:00:00Z` }));
  const l4 = [...[1, 2, 3, 4].map((id) => L(id, 'A', '1', 'Regular', 10, 2, 2)), L(1, 'B', '9', 'One Game Wonder', 30, 2, 2)];
  ok('per-game boards need half the games', leaders(playerSeasons(l4, g4)).find((b) => b.key === 'ppg')?.rows.map((r) => r.player.name).join() === 'Regular');
}
ok('threes made counts everyone', lb.find((b) => b.key === 'tpm')?.rows[0].value === 2);
ok('empty boards are dropped', !lb.some((b) => b.rows.length === 0));
const hi = seasonHighs(ps);
ok('single-game highs', hi[0].rows[0].value === 22 && hi[0].rows[0].player.name === 'Ava N' && hi[0].rows[0].game.gameId === 2);
ok('no lines, no players', playerSeasons([], games).length === 0 && leaders([]).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
