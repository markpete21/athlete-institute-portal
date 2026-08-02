#!/usr/bin/env node
/**
 * Seed believable competitive data so the Compete. Portal (and the admin
 * competitive screens) can be designed against real density instead of empty
 * states: a half-played summer league (masked names), a championship
 * tournament mid-bracket (full names), and a rep team with nothing played yet
 * (both empty states on a published division).
 *
 * Every program is tagged created_by = 'system:demo-seed' and everything else
 * (divisions, teams, games, registrations, family members, the one family)
 * hangs off those programs or the demo family, so removal is exact and total:
 *
 *   node scripts/seed-demo-compete.mjs          # clear + reseed
 *   node scripts/seed-demo-compete.mjs --clear  # remove all demo compete data
 *
 * DESIGN data, not test fixtures - never runs in CI, never touches rows that
 * don't carry the demo tag. Games are inserted WITHOUT bookings on purpose:
 * the master schedule has its own demo seed (seed-demo-week.mjs) and this one
 * shouldn't pollute it.
 */
import { readFileSync } from 'node:fs';

const ACTOR = 'system:demo-seed';
const FAMILY_NAME = 'Compete Demo Households';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Supabase env missing from .env.local');

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: init.method === 'POST' ? 'return=representation' : 'return=minimal',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => rest(p);
const post = (p, body) => rest(p, { method: 'POST', body: JSON.stringify(body) });
const del = (p) => rest(p, { method: 'DELETE' });

// Toronto is EDT (-04:00) for the July/August window this demo lives in.
const at = (date, time) => `${date}T${time}:00-04:00`;

// ---------------------------------------------------------------------------
// Clear: programs cascade to divisions -> teams/team_members/games. Then the
// demo registrations, family members and the family itself.
// ---------------------------------------------------------------------------
async function clear() {
  const progs = await get(`programs?select=id&created_by=eq.${ACTOR}`);
  if (progs.length) {
    const ids = progs.map((p) => p.id).join(',');
    await del(`registrations?program_id=in.(${ids})`);
    await del(`programs?id=in.(${ids})`);
  }
  const fams = await get(`families?select=id&name=eq.${encodeURIComponent(FAMILY_NAME)}`);
  for (const f of fams) {
    await del(`family_members?family_id=eq.${f.id}`);
    await del(`families?id=eq.${f.id}`);
  }
  console.log(`cleared ${progs.length} demo programs${fams.length ? ' + demo family' : ''}`);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
const FIRST = ['Liam','Noah','Ethan','Lucas','Mason','Owen','Carter','Jack','Aiden','Cole','Ava','Emma','Olivia','Sophia','Maya','Chloe','Zoe','Ella','Nora','Ruby','Leo','Max','Kai','Theo','Nathan','Ben','Sam','Alex','Ryan','Josh','Grace','Lily','Hannah','Sadie','Claire','Violet','Isla','Jade','Piper','Quinn'];
const LAST = ['Tremblay','Nguyen','Patel','MacDonald','Rossi','Silva','Chen','Kowalski','Fontaine','Brennan','Sinclair','Osei','Gallagher','Bouchard','Klassen','Reyes','Ivanov','Larsen','Whitfield','Moretti','Campbell','Dhillon','Beauchamp','Kaur','OBrien','Sato','Lindqvist','Marsh','Delacroix','Huang'];
function* nameGen() {
  let i = 0;
  while (true) { yield [FIRST[i % FIRST.length], LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]]; i++; }
}

async function programTypeId(key) {
  const rows = await get(`program_types?select=id&key=eq.${key}`);
  if (!rows.length) throw new Error(`program type ${key} missing`);
  return rows[0].id;
}

async function seed() {
  await clear();

  const leagueType = await programTypeId('league');
  const clubType = await programTypeId('club');
  const otherType = await programTypeId('other');

  const family = (await post('families', { name: FAMILY_NAME }))[0];
  const names = nameGen();

  /** roster `count` players onto a team: family_member -> registration -> team_member */
  async function roster(programId, divisionId, teamId, count, { hideFirst = false } = {}) {
    const members = [];
    for (let i = 0; i < count; i++) {
      const [first_name, last_name] = names.next().value;
      members.push({ family_id: family.id, first_name, last_name, member_role: 'dependent', hide_from_public_rosters: hideFirst && i === 0 });
    }
    const fmRows = await post('family_members', members);
    const regRows = await post('registrations', fmRows.map((m) => ({ program_id: programId, family_id: family.id, family_member_id: m.id, season_key: '2026:may-aug', status: 'active' })));
    await post('team_members', regRows.map((r) => ({ division_id: divisionId, team_id: teamId, registration_id: r.id })));
  }

  // --- 1. Summer league: masked names, half-played round robin --------------
  const league = (await post('programs', {
    name: 'Summer Youth League', program_type_id: leagueType, category: 'Youth Sports',
    sport_tag: 'basketball', season_key: '2026:may-aug', year: 2026, brand_key: 'athlete-institute',
    status: 'registration_open', share_token: 'demo-compete-league', created_by: ACTOR,
  }))[0];
  const d1 = (await post('divisions', { program_id: league.id, name: 'U13 Boys', sport: 'basketball', show_on_compete: true, show_full_names: false }))[0];
  const teamNames1 = ['Ridgeview Rockets', 'Mono Mills Heat', 'Broadway Bounce', 'Island Lake Storm', 'Credit Creek Cougars', 'Hockley Hawks'];
  const t1 = [];
  for (let i = 0; i < teamNames1.length; i++) t1.push((await post('teams', { division_id: d1.id, name: teamNames1[i], sort_order: i }))[0].id);
  for (let i = 0; i < t1.length; i++) await roster(league.id, d1.id, t1[i], 8, { hideFirst: i === 0 });

  // Single round robin, 6 teams -> 5 rounds x 3 games, Tuesdays 18/19/20h.
  // Rounds 1-3 are played (July), 4-5 upcoming (August).
  const TUESDAYS = ['2026-07-07', '2026-07-14', '2026-07-21', '2026-08-04', '2026-08-11'];
  const SLOTS = ['18:00', '19:00', '20:00'];
  // circle method pairings for 6 teams (0-indexed into t1)
  const ROUNDS = [
    [[0, 5], [1, 4], [2, 3]],
    [[0, 4], [5, 3], [1, 2]],
    [[0, 3], [4, 2], [5, 1]],
    [[0, 2], [3, 1], [4, 5]],
    [[0, 1], [2, 5], [3, 4]],
  ];
  const SCORES = [ // believable U13 results for rounds 1-3; one OT thriller
    [[52, 44], [38, 41], [47, 33]],
    [[45, 45 + 6], [50, 42], [39, 36]],
    [[61, 29], [44, 48], [40, 37]],
  ];
  const games1 = [];
  ROUNDS.forEach((pairs, r) => {
    pairs.forEach(([h, a], gi) => {
      const played = r < 3;
      games1.push({
        division_id: d1.id, round: r + 1, home_team_id: t1[h], away_team_id: t1[a],
        starts_at: at(TUESDAYS[r], SLOTS[gi]), ends_at: at(TUESDAYS[r], `${Number(SLOTS[gi].slice(0, 2)) + 1}:00`.padStart(5, '0')),
        court: (gi % 2) + 1,
        status: played ? 'final' : 'scheduled',
        home_score: played ? SCORES[r][gi][0] : null,
        away_score: played ? SCORES[r][gi][1] : null,
        overtime: r === 1 && gi === 0,
        live_stream_ref: played && r === 2 && gi === 0 ? 'demo-league-stream' : null,
      });
    });
  });
  await post('games', games1);

  // --- 2. Championship tournament: full names, bracket mid-flight -----------
  const tourney = (await post('programs', {
    name: 'Bears Fall Classic', program_type_id: otherType, category: 'Youth Sports',
    sport_tag: 'basketball', season_key: '2026:may-aug', year: 2026, brand_key: 'bears',
    tournament_mode: 'championship', status: 'registration_open',
    share_token: 'demo-compete-tourney', created_by: ACTOR,
  }))[0];
  const d2 = (await post('divisions', { program_id: tourney.id, name: '17U Championship', sport: 'basketball', show_on_compete: true, show_full_names: true }))[0];
  const teamNames2 = ['Orangeville Prep Black', 'Northern Kings', 'Toronto City Elite', 'Hamilton Riverhawks', 'Ottawa Gators', 'London Lightning U17', 'Durham Dragons', 'Niagara Surge'];
  const t2 = [];
  for (let i = 0; i < teamNames2.length; i++) t2.push((await post('teams', { division_id: d2.id, name: teamNames2[i], sort_order: i }))[0].id);
  for (let i = 0; i < t2.length; i++) await roster(tourney.id, d2.id, t2[i], 5);

  // Quarters played July 25, semis played July 26, final upcoming Aug 8 with a stream.
  const QF = [[0, 7, 78, 54], [3, 4, 66, 71], [2, 5, 82, 79], [1, 6, 70, 58]];
  // PostgREST bulk inserts require identical keys on every row.
  const games2 = QF.map(([h, a, hs, as], i) => ({
    division_id: d2.id, round: 1, home_team_id: t2[h], away_team_id: t2[a],
    starts_at: at('2026-07-25', ['09:00', '11:00', '13:00', '15:00'][i]), court: (i % 2) + 1,
    status: 'final', home_score: hs, away_score: as, overtime: i === 2, live_stream_ref: null,
  }));
  games2.push(
    { division_id: d2.id, round: 2, home_team_id: t2[0], away_team_id: t2[4], starts_at: at('2026-07-26', '12:00'), court: 1, status: 'final', home_score: 74, away_score: 68, overtime: false, live_stream_ref: null },
    { division_id: d2.id, round: 2, home_team_id: t2[2], away_team_id: t2[1], starts_at: at('2026-07-26', '14:00'), court: 1, status: 'final', home_score: 69, away_score: 73, overtime: false, live_stream_ref: null },
    { division_id: d2.id, round: 3, home_team_id: t2[0], away_team_id: t2[1], starts_at: at('2026-08-08', '13:00'), court: 1, status: 'scheduled', home_score: null, away_score: null, overtime: false, live_stream_ref: 'demo-final-stream' },
  );
  await post('games', games2);

  // --- 3. Rep team, published, nothing played yet (empty-state card) --------
  const rep = (await post('programs', {
    name: 'Bears Rep Volleyball', program_type_id: clubType, category: 'Club',
    sport_tag: 'volleyball', season_key: '2026:sep-dec', year: 2026, brand_key: 'bears',
    status: 'published', share_token: 'demo-compete-rep', created_by: ACTOR,
  }))[0];
  const d3 = (await post('divisions', { program_id: rep.id, name: '15U Girls Rep', sport: 'volleyball', show_on_compete: true, show_full_names: true }))[0];
  const t3 = (await post('teams', { division_id: d3.id, name: 'Bears 15U Girls', sort_order: 0 }))[0].id;
  await roster(rep.id, d3.id, t3, 10);

  console.log('seeded: Summer Youth League (U13 Boys, masked, 15 games/9 final),');
  console.log('        Bears Fall Classic (17U Championship, full names, bracket),');
  console.log('        Bears Rep Volleyball (15U Girls Rep, published, unplayed)');
}

if (process.argv.includes('--clear')) await clear();
else await seed();
