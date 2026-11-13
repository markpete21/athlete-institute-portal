/** Per-game jersey fix tests. Run: npm run test:jerseys */
import { applyJerseyFixes, applyJerseyFixesToEvents, parsePick, wornKey } from './__compiled__/jerseys.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };
const line = (gameId, team, number, name, pts, o = {}) => ({ gameId, team, isTotal: false, number, name, pts, reb: 1, ast: 0, stl: null, blk: null, tov: null, oreb: null, dreb: null, pf: null, fgm: 1, fga: 2, tpm: null, tpa: null, ftm: null, fta: null, min: null, ...o });
const total = (gameId, team, pts) => ({ ...line(gameId, team, null, 'TEAM', pts), isTotal: true });

// The real first game: roster says #17 is Willian Vu, the tagging says #17 was Nathan M. and #6 was William V.
const lines = [line(15, 'Bears', '17', 'Willian Vu', 11), line(15, 'Bears', '6', 'William V.', 11), line(15, 'Bears', '39', '#39', 1), line(15, 'Bears', '19', 'Aaryan Channa', 3), total(15, 'Bears', 57), line(15, 'Lions', '17', 'Someone Else', 4), line(16, 'Bears', '17', 'Willian Vu', 9)];
const fixes = [
  { gameId: 15, team: 'Bears', worn: '17', asNumber: '21', asName: 'Nathan Moore', hidden: false },
  { gameId: 15, team: 'Bears', worn: '6', asNumber: '17', asName: 'Willian Vu', hidden: false },
  { gameId: 15, team: 'Bears', worn: '39', asNumber: '19', asName: 'Aaryan Channa', hidden: false },
];
const out = applyJerseyFixes(lines, fixes);
const find = (g, t, n) => out.find((l) => l.gameId === g && l.team === t && l.number === n && !l.isTotal);
ok('no fixes leaves the lines alone', applyJerseyFixes(lines, []) === lines);
ok('worn #17 becomes #21 Nathan Moore for this game', find(15, 'Bears', '21')?.name === 'Nathan Moore' && find(15, 'Bears', '21').pts === 11);
ok('worn #6 becomes roster #17 Willian Vu (a swap, not a merge)', find(15, 'Bears', '17')?.name === 'Willian Vu' && find(15, 'Bears', '17').pts === 11);
ok('misread #39 merges into #19', find(15, 'Bears', '19')?.pts === 4 && find(15, 'Bears', '19').reb === 2 && !find(15, 'Bears', '39'));
ok('nulls stay null when merged, numbers add', find(15, 'Bears', '19').stl === null && find(15, 'Bears', '19').fga === 4);
ok('team totals untouched', out.find((l) => l.isTotal).pts === 57);
ok('other team with the same number untouched', find(15, 'Lions', '17')?.name === 'Someone Else');
ok('other games untouched', find(16, 'Bears', '17')?.name === 'Willian Vu' && find(16, 'Bears', '17').pts === 9);
ok('line count: 7 in, one merged away', out.length === 6);
{
  const hid = applyJerseyFixes(lines, [{ gameId: 15, team: 'Bears', worn: '39', asNumber: null, asName: null, hidden: true }]);
  ok('hidden line is dropped, totals stay', !hid.some((l) => l.number === '39') && hid.some((l) => l.isTotal) && hid.length === 6);
  const two = applyJerseyFixes([line(1, 'A', '4', 'Sam', 2), line(1, 'A', '4', 'Sam', 3)], [{ gameId: 1, team: 'A', worn: '9', asNumber: '10', asName: 'X', hidden: false }]);
  ok('duplicates nobody fixed are not merged', two.length === 2);
  const nameOnly = applyJerseyFixes([line(1, 'A', '8', 'Old Name', 2)], [{ gameId: 1, team: 'A', worn: '8', asNumber: null, asName: 'New Name', hidden: false }]);
  ok('name-only fix keeps the number', nameOnly[0].number === '8' && nameOnly[0].name === 'New Name');
  const mins = applyJerseyFixes([line(1, 'A', '4', 'Sam', 2, { min: '8.7' }), line(1, 'A', '40', '#40', 3, { min: '1.5' })], [{ gameId: 1, team: 'A', worn: '40', asNumber: '4', asName: 'Sam', hidden: false }]);
  ok('minutes add up on a merge', mins.length === 1 && mins[0].min === '10.2' && mins[0].pts === 5);
}
{
  const ev = [{ gameId: 15, team: 'Bears', number: '17', name: 'Nathan M.', type: 'two_point' }, { gameId: 15, team: 'Bears', number: '39', name: '#39', type: 'free_throw' }, { gameId: 15, team: 'Lions', number: '17', name: null, type: 'steal' }, { gameId: 15, team: 'Bears', number: null, name: null, type: 'rebound' }];
  const e = applyJerseyFixesToEvents(ev, [...fixes.slice(0, 2), { gameId: 15, team: 'Bears', worn: '39', asNumber: null, asName: null, hidden: true }]);
  ok('plays follow the fix', e[0].number === '21' && e[0].name === 'Nathan Moore');
  ok('a hidden jersey keeps the play but loses the player', e[1].number === null && e[1].type === 'free_throw');
  ok('other team and numberless plays untouched', e[2].number === '17' && e[3].number === null);
}
ok('worn key: number without #, or the name', wornKey('#17', 'X') === '17' && wornKey(null, ' Sam Lee ') === '~sam lee');
ok('pick: roster player', JSON.stringify(parsePick('r:6|William Vu', '', '')) === JSON.stringify({ asNumber: '6', asName: 'William Vu', hidden: false }));
ok('pick: hide', parsePick('hide', '', '')?.hidden === true);
ok('pick: other needs something typed', parsePick('other', '', '') === null && parsePick('other', '#24', 'Jay Cole')?.asNumber === '24');
ok('pick: as roster clears the fix', parsePick('', '9', 'x') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
