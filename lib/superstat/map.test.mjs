/**
 * Superstat mapping tests. Run: npm run test:superstat
 * Payload shapes are the samples in Superstat's API reference.
 */
import { boxScoreToSides, linkMatch, suggestTeam, teamFitsDivision, eventsToRows } from './__compiled__/superstat/map.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

const totals = { points: 68, fieldGoalsMade: 26, fieldGoalsAttempted: 58, fieldGoalPercentage: 44.8, threePointersMade: 6, threePointersAttempted: 18, threePointPercentage: 33.3, freeThrowsMade: 10, freeThrowsAttempted: 14, freeThrowPercentage: 71.4, offensiveRebounds: 11, defensiveRebounds: 23, rebounds: 34, assists: 15, steals: 9, blocks: 3, turnovers: 12, fouls: 16 };
const p = (name, num, pts, reb = 2, ast = 1) => ({ ...totals, points: pts, rebounds: reb, assists: ast, playerId: `pid-${num}`, rosterEntryId: `re-${num}`, name, jerseyNumber: num, minutes: 27.4, efficiency: 24 });
const box = { matchId: 'm1', team: { name: 'Bears U13', totals, players: [p('Low Scorer', '5', 2), p('Ava Nguyen', '7', 18, 7, 4), p('Mid', '9', 11)] }, opponent: { name: 'Lions U13', totals: { ...totals, points: 61 }, players: [] } };

{
  const s = boxScoreToSides(box);
  ok('players sorted by points', s.team.lines.map((l) => l.number).join() === '7,9,5', s.team.lines.map((l) => l.number).join());
  const a = s.team.lines[0];
  ok('player fields', a.name === 'Ava Nguyen' && a.pts === 18 && a.reb === 7 && a.ast === 4 && a.superstatPlayerId === 'pid-7');
  ok('shooting + extras', a.fgm === 26 && a.fga === 58 && a.tpm === 6 && a.fta === 14 && a.oreb === 11 && a.dreb === 23 && a.pf === 16 && a.min === '27.4');
  ok('team total row', s.team.total.isTotal && s.team.total.pts === 68 && s.team.total.tov === 12);
  ok('opponent totals without players', s.opponent.lines.length === 0 && s.opponent.total.pts === 61);
}

const ssTeams = [
  { id: 't-b13', clubId: 'c', name: 'Orangeville Bears U13', ageGroup: 'u13', gender: 'boys' },
  { id: 't-b14', clubId: 'c', name: 'Orangeville Bears U14', ageGroup: 'u14', gender: 'boys' },
  { id: 't-l13', clubId: 'c', name: 'Woodbridge Lions U13', ageGroup: 'u13', gender: 'boys' },
];
ok('age group fits division', teamFitsDivision(ssTeams[0], 'U13 Boys') && !teamFitsDivision(ssTeams[1], 'U13 Boys'));
ok('gender mismatch rejected', !teamFitsDivision({ name: 'Bears U13', ageGroup: 'u13', gender: 'girls' }, 'U13 Boys'));
ok('suggest by club name + age', suggestTeam('Orangeville Bears', 'U13 Boys', ssTeams)?.id === 't-b13');
ok('suggest other division', suggestTeam('Orangeville Bears', 'U14 Boys', ssTeams)?.id === 't-b14');
ok('no suggestion when nothing fits', suggestTeam('Motion Kings', 'U13 Boys', ssTeams) === null);
// The league's real naming: age first, and one team left on age group "open".
const real = [
  { id: 'k13', clubId: 'c', name: 'U13 Motion Kings', ageGroup: 'u13', gender: null },
  { id: 'b13', clubId: 'c', name: 'U13 Orangeville Bears', ageGroup: 'open', gender: null },
  { id: 'l13', clubId: 'c', name: 'U13 Woodbridge Lions', ageGroup: 'u13', gender: null },
  { id: 'w14', clubId: 'c', name: 'U14 Nexus Wolves', ageGroup: 'u14', gender: null },
  { id: 'b14', clubId: 'c', name: 'U14 Orangeville Bears', ageGroup: 'u14', gender: null },
  { id: 'l14', clubId: 'c', name: 'U14 Woodbridge Lions', ageGroup: 'u14', gender: null },
  { id: 'd15', clubId: 'c', name: 'U15 David Ann Academy', ageGroup: 'u15', gender: null },
];
ok('age in the name beats age group "open"', suggestTeam('Orangeville Bears', 'U13 Boys', real)?.id === 'b13');
ok('same club, other division', suggestTeam('Orangeville Bears', 'U14 Boys', real)?.id === 'b14');
ok('no U15 Bears yet: nothing suggested', suggestTeam('Orangeville Bears', 'U15 Boys', real) === null);
ok('U15 David Ann Academy', suggestTeam('David Ann Academy', 'U15 Boys', real)?.id === 'd15');
ok('U14 Wolves, not a U15 guess', suggestTeam('Nexus Wolves', 'U14 Boys', real)?.id === 'w14' && suggestTeam('Nexus Wolves', 'U15 Boys', real) === null);

const links = [{ superstatTeamId: 't-b13', team: 'Orangeville Bears', division: 'U13 Boys' }, { superstatTeamId: 't-l13', team: 'Woodbridge Lions', division: 'U13 Boys' }];
const games = [
  { id: 1, division: 'U13 Boys', home: 'Orangeville Bears', away: 'Woodbridge Lions', startsAt: '2026-11-04T23:30:00.000Z' },
  { id: 2, division: 'U13 Boys', home: 'Woodbridge Lions', away: 'Motion Kings', startsAt: '2026-11-05T01:00:00.000Z' },
  { id: 7, division: 'U13 Boys', home: 'Orangeville Bears', away: 'Motion Kings', startsAt: '2026-11-25T23:30:00.000Z' },
  { id: 9, division: 'U14 Boys', home: 'Orangeville Bears', away: 'Woodbridge Lions', startsAt: '2026-11-11T23:30:00.000Z' },
];
const match = (over) => ({ id: 'm1', playedAt: '2026-11-04T23:35:00.000Z', status: 'complete', team: { id: 't-b13', name: 'Orangeville Bears U13', score: 66 }, opponent: { id: 't-l13', name: 'Woodbridge Lions U13', score: 47 }, recordedBy: 'team', opponentStatsTracked: true, failureReason: null, periods: [], ...over });
{
  const l = linkMatch(match({}), games, links);
  ok('both teams ours: the game between them', l?.gameId === 1 && l.teamName === 'Orangeville Bears' && l.opponentName === 'Woodbridge Lions', JSON.stringify(l));
  const away = linkMatch(match({ team: { id: 't-l13', name: 'Lions', score: 47 }, opponent: { id: 't-b13', name: 'Bears', score: 66 } }), games, links);
  ok('uploader is the away side', away?.gameId === 1 && away.teamName === 'Woodbridge Lions' && away.opponentName === 'Orangeville Bears');
  const anon = linkMatch(match({ opponent: { id: null, name: 'Opposition', score: 47 } }), games, links);
  ok('unknown opponent: by team + date', anon?.gameId === 1 && anon.opponentName === 'Woodbridge Lions', JSON.stringify(anon));
  const late = linkMatch(match({ id: 'm7', playedAt: '2026-11-25T23:40:00.000Z', opponent: { id: null, name: 'Opposition', score: 40 } }), games, links);
  ok('later date picks the later game', late?.gameId === 7 && late.opponentName === 'Motion Kings');
  ok('far-off date links nothing', linkMatch(match({ playedAt: '2026-12-20T00:00:00.000Z', opponent: { id: null, name: 'x', score: 1 } }), games, links) === null);
  ok('unmapped team links nothing', linkMatch(match({ team: { id: 'zzz', name: 'x', score: 1 }, opponent: { id: null, name: 'y', score: 1 } }), games, links) === null);
  const weekLate = linkMatch(match({ playedAt: '2026-11-11T03:35:00.000Z' }), games, links);
  ok('uploaded a week after the game: still that game', weekLate?.gameId === 1, JSON.stringify(weekLate));
  const rematch = [...games, { id: 20, division: 'U13 Boys', home: 'Woodbridge Lions', away: 'Orangeville Bears', startsAt: '2027-01-20T23:30:00.000Z' }];
  ok('a later rematch is not picked before it is played', linkMatch(match({ playedAt: '2026-11-11T03:35:00.000Z' }), rematch, links)?.gameId === 1);
  ok('two played games between the same teams, upload near neither: left for a person', linkMatch(match({ playedAt: '2027-02-01T00:00:00.000Z' }), rematch, links) === null);
  ok('two played games, uploaded the night of the second', linkMatch(match({ playedAt: '2027-01-21T03:00:00.000Z' }), rematch, links)?.gameId === 20);
  const relink = linkMatch(match({ playedAt: '2027-01-01T00:00:00.000Z' }), games.map((g) => (g.id === 1 ? { ...g, superstatMatchId: 'm1' } : g)), links);
  ok('already linked stays linked', relink?.gameId === 1);
  const taken = linkMatch(match({ id: 'm-other' }), games.map((g) => (g.id === 1 ? { ...g, superstatMatchId: 'm1' } : g)), links);
  ok('a game linked to another match is not reused', taken === null);
}
{
  const rows = eventsToRows([{ id: 'e1', type: 'three_point', success: true, side: 'team', matchSeconds: 1432.5, periodId: 'p', periodNumber: 2, periodType: 'quarter', periodSeconds: 232.5, player: { id: 'x', rosterEntryId: 'r', name: 'Ava Nguyen', jerseyNumber: '7' }, location: { x: 0.72, y: 0.41 }, customEventName: null }, { id: 'e2', type: 'rebound', success: null, side: 'opponent', matchSeconds: 1440, periodId: 'p', periodNumber: 2, periodType: 'quarter', periodSeconds: 240, player: null, location: null, customEventName: null }], 'Orangeville Bears', 'Woodbridge Lions');
  ok('event sides resolve to team names', rows[0].team === 'Orangeville Bears' && rows[1].team === 'Woodbridge Lions');
  ok('shot location kept, others null', rows[0].x === 0.72 && rows[0].y === 0.41 && rows[1].x === null && rows[0].number === '7');
}

{
  // The real club (Nov 12, 2026): Superstat says "male", the division says "Boys".
  const real = [['U13 Motion Kings', 'u13', 'male'], ['U13 Orangeville Bears', 'u13', 'male'], ['U13 Woodbridge Lions', 'u13', 'male'], ['U14 Orangeville Bears', 'u14', 'male'], ['U15 Nexus Wolves', 'u15', null]].map(([name, ageGroup, gender], i) => ({ id: `t${i}`, name, ageGroup, gender }));
  ok('male team fits a Boys division', teamFitsDivision(real[1], 'U13 Boys'));
  ok('male team does not fit a Girls division', !teamFitsDivision(real[1], 'U13 Girls'));
  ok('real club: U13 Boys Bears resolves', suggestTeam('Orangeville Bears', 'U13 Boys', real)?.id === 't1');
  ok('real club: U14 Boys Bears resolves to the U14 team', suggestTeam('Orangeville Bears', 'U14 Boys', real)?.id === 't3');
  const links = [{ superstatTeamId: 't1', team: 'Orangeville Bears', division: 'U13 Boys' }, { superstatTeamId: 't2', team: 'Woodbridge Lions', division: 'U13 Boys' }];
  const games = [{ id: 15, division: 'U13 Boys', home: 'Orangeville Bears', away: 'Woodbridge Lions', startsAt: '2026-11-04T23:30:00+00:00' }, { id: 20, division: 'U13 Boys', home: 'Orangeville Bears', away: 'Woodbridge Lions', startsAt: '2027-02-10T23:30:00+00:00' }, { id: 17, division: 'U13 Boys', home: 'Orangeville Bears', away: 'Motion Kings', startsAt: '2026-11-25T23:30:00+00:00' }];
  // Opponent typed by name (no id), date picked with no time.
  const m = { id: 'm-real', playedAt: '2026-11-04T00:00:00.000Z', status: 'complete', team: { id: 't1', name: 'U13 Orangeville Bears', score: 35 }, opponent: { id: null, name: 'U13 Woodbridge Lions', score: 23 }, recordedBy: 'team', opponentStatsTracked: true };
  const l = linkMatch(m, games, links);
  ok('real match: date-only day, opponent by name → the Nov 4 game', l?.gameId === 15 && l.teamName === 'Orangeville Bears' && l.opponentName === 'Woodbridge Lions', JSON.stringify(l));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
