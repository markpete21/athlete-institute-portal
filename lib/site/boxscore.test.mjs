/**
 * Box-score parser tests (site-run leagues). Run: npm run test:boxscore
 * Sample: the Superstat match pack for U13 Orangeville Bears 66–47 (Nov 2026).
 */
import { parseBoxScore, parseSummaryLine, teamTotals, topLines, pct } from './__compiled__/boxscore.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

const superstat = `Box score
66 PTS FG 29-75 (38.7%) 3PT 4-20 (20%) FT 4-11 (36.4%) 41 REB 13 AST 11 STL 0 BLK 22 TO
Opposition 47 PTS FG 19-51 (37.3%) 3PT 2-9 (22.2%) FT 7-13 (53.8%) 31 REB 7 AST 6 STL 0 BLK 20 TO
Player # PTS REB AST STL BLK TO FG FG% 3PT 3P% FT FT%
#15 15 14 3 2 1 0 1 6-11 54.5 1-4 25.0 1-1 100.0
#14 14 13 4 2 1 0 1 6-9 66.7 1-3 33.3 0-0 -
#17 17 10 14 0 4 0 5 4-11 36.4 0-2 0.0 2-6 33.3
#6 6 10 5 6 1 0 3 5-13 38.5 0-1 0.0 0-2 0.0
#19 19 9 3 1 1 0 0 4-8 50.0 1-2 50.0 0-0 -
#13 13 4 3 0 1 0 1 2-9 22.2 0-2 0.0 0-0 -
#8 8 3 2 0 0 0 5 1-3 33.3 1-2 50.0 0-0 -
#10 10 2 1 0 0 0 0 1-1 100.0 0-0 - 0-0 -
#39 39 1 3 2 1 0 3 0-6 0.0 0-3 0.0 1-2 50.0
#16 16 0 2 0 0 0 2 0-3 0.0 0-1 0.0 0-0 -
#2 2 0 1 0 0 0 1 0-1 0.0 0-0 - 0-0 -
#5 5 0 0 0 1 0 0 0-0 - 0-0 - 0-0 -
TEAM 66 41 13 11 0 22 29-75 38.7 4-20 20.0 4-11 36.4`;

{
  const r = parseBoxScore(superstat);
  ok('12 player lines', r.lines.length === 12, String(r.lines.length));
  ok('no warnings', r.warnings.length === 0, r.warnings.join('; '));
  const p15 = r.lines[0];
  ok('#15 number', p15.number === '15');
  ok('#15 has no name', p15.name === null);
  ok('#15 pts/reb/ast', p15.pts === 14 && p15.reb === 3 && p15.ast === 2, JSON.stringify(p15));
  ok('#15 stl/blk/to', p15.stl === 1 && p15.blk === 0 && p15.tov === 1);
  ok('#15 shooting', p15.fgm === 6 && p15.fga === 11 && p15.tpm === 1 && p15.tpa === 4 && p15.ftm === 1 && p15.fta === 1);
  ok('#17 14 rebounds', r.lines[2].reb === 14);
  ok('dash means null-free 0-0', r.lines[1].ftm === 0 && r.lines[1].fta === 0);
  ok('TEAM row is the total', r.total?.pts === 66 && r.total?.reb === 41 && r.total?.tov === 22 && r.total?.fgm === 29 && r.total?.fga === 75);
  ok('top five by points', topLines(r.lines).map((l) => l.number).join() === '15,14,17,6,19', topLines(r.lines).map((l) => l.number).join());
  ok('FG% 38.7', pct(r.total.fgm, r.total.fga) === 38.7);
}
{
  const t = parseSummaryLine('Opposition 47 PTS FG 19-51 (37.3%) 3PT 2-9 (22.2%) FT 7-13 (53.8%) 31 REB 7 AST 6 STL 0 BLK 20 TO');
  ok('summary pts', t?.pts === 47);
  ok('summary shooting', t?.fgm === 19 && t?.fga === 51 && t?.tpm === 2 && t?.tpa === 9 && t?.ftm === 7 && t?.fta === 13);
  ok('summary counts', t?.reb === 31 && t?.ast === 7 && t?.stl === 6 && t?.blk === 0 && t?.tov === 20);
  const r = parseBoxScore('Opposition 47 PTS FG 19-51 (37.3%) 3PT 2-9 (22.2%) FT 7-13 (53.8%) 31 REB 7 AST 6 STL 0 BLK 20 TO');
  ok('summary-only paste: totals, no lines', r.lines.length === 0 && r.total?.pts === 47);
}
{
  const tsv = 'Player\t#\tPTS\tREB\tAST\nJalen Carter\t3\t21\t6\t4\nMason Reid\t11\t9\t2\t1';
  const r = parseBoxScore(tsv);
  ok('tab-separated names with spaces', r.lines[0].name === 'Jalen Carter' && r.lines[0].number === '3' && r.lines[0].pts === 21);
  ok('summed totals when no TEAM row', teamTotals(r.lines, r.total)?.pts === 30);
  const sp = parseBoxScore('Player # PTS REB AST\nJalen Carter 3 21 6 4');
  ok('space-separated names with spaces', sp.lines[0].name === 'Jalen Carter' && sp.lines[0].pts === 21);
}
{
  const r = parseBoxScore('nothing useful here');
  ok('garbage warns', r.warnings.length === 1 && !r.total);
  const mism = parseBoxScore('Player # PTS REB AST\n#1 1 10 0 0\nTEAM 12 0 0');
  ok('points mismatch warns', mism.warnings.some((w) => /add up/.test(w)), mism.warnings.join('; '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
