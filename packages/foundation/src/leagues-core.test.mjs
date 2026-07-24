/** League helper tests (Module 7). Run: npm run test:leagues */
import { joinLinkOpen, joinLinkExpiry, leagueLineCents, smallGroupComplete, namesMatch } from './__compiled__/leagues-core.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

// join link
ok('open within window + under cap', joinLinkOpen({ expiresAtISO: '2026-10-01T00:00:00Z', memberCount: 5, maxPlayers: 12, nowISO: '2026-09-20T00:00:00Z' }).open);
ok('closed when full', joinLinkOpen({ expiresAtISO: '2026-10-01T00:00:00Z', memberCount: 12, maxPlayers: 12, nowISO: '2026-09-20T00:00:00Z' }).reason === 'full');
ok('closed when expired', joinLinkOpen({ expiresAtISO: '2026-09-15T00:00:00Z', memberCount: 3, maxPlayers: 12, nowISO: '2026-09-20T00:00:00Z' }).reason === 'expired');
ok('expiry = season start + 14d', joinLinkExpiry('2026-09-08').startsWith('2026-09-22'), joinLinkExpiry('2026-09-08'));

// pricing paths
ok('captain team-rate pays team fee', leagueLineCents({ pricing: 'team', path: 'captain', playerFeeCents: 10000, teamRateCents: 80000, captainPaysTeam: true }) === 80000);
ok('captain player-price pays own fee', leagueLineCents({ pricing: 'player', path: 'captain', playerFeeCents: 10000, teamRateCents: 80000, captainPaysTeam: false }) === 10000);
ok('member on paid team pays $0', leagueLineCents({ pricing: 'team', path: 'member', playerFeeCents: 10000, teamRateCents: 80000, captainPaysTeam: true }) === 0);
ok('free agent pays player fee', leagueLineCents({ pricing: 'player', path: 'free_agent', playerFeeCents: 10000, teamRateCents: 0, captainPaysTeam: false }) === 10000);

// small group hold
ok('group incomplete until all named register', !smallGroupComplete(['Sam', 'Alex'], 2)); // first member + 2 named = need 3
ok('group complete when all in', smallGroupComplete(['Sam', 'Alex'], 3));

// name match
ok('name match normalizes', namesMatch('Sam O’Neil', 'sam oneil'));
ok('name mismatch flagged', !namesMatch('Sam', 'Samantha'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
