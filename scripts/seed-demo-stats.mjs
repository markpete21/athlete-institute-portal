#!/usr/bin/env node
/**
 * Demo BOX SCORES for the seeded Summer Youth League division, so the public
 * Stats tab, leader boards and player profiles can be designed against real
 * density. Rides on seed-demo-compete.mjs data (finds the division through
 * the system:demo-seed program tag - ids regenerate on reseed, so nothing is
 * hardcoded). Lines are deterministic from (member id, game id), so reruns
 * are idempotent, and the division's stats platform is switched ON.
 *
 *   node scripts/seed-demo-stats.mjs          # seed lines + enable stats
 *   node scripts/seed-demo-stats.mjs --clear  # remove lines + disable stats
 *
 * DESIGN data, not test fixtures - only touches games in the demo division.
 */
import { readFileSync } from 'fs';

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
      Prefer: init.method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => rest(p);
const post = (p, body) => rest(p, { method: 'POST', body: JSON.stringify(body) });
const patch = (p, body) => rest(p, { method: 'PATCH', body: JSON.stringify(body) });
const del = (p) => rest(p, { method: 'DELETE' });

const clear = process.argv.includes('--clear');

const programs = await get(`programs?select=id,name&created_by=eq.system:demo-seed&name=ilike.*Summer*`);
if (!programs?.length) { console.log('no demo summer program - run seed-demo-compete.mjs first'); process.exit(0); }
const divisions = await get(`divisions?select=id,name&program_id=in.(${programs.map((p) => p.id).join(',')})`);
if (!divisions?.length) { console.log('no demo division found'); process.exit(0); }
const div = divisions[0];

if (clear) {
  await del(`game_stat_lines?division_id=eq.${div.id}`);
  await patch(`divisions?id=eq.${div.id}`, { stats_enabled: false });
  console.log(`cleared stat lines + stats OFF for division ${div.id} (${div.name})`);
  process.exit(0);
}

const games = await get(`games?select=id,home_team_id,away_team_id&division_id=eq.${div.id}&status=eq.final`);
const members = await get(`team_members?select=id,team_id&division_id=eq.${div.id}`);
if (!games?.length || !members?.length) { console.log('nothing to seed', games?.length ?? 0, members?.length ?? 0); process.exit(0); }

const rows = [];
for (const g of games) {
  for (const m of members.filter((m) => m.team_id === g.home_team_id || m.team_id === g.away_team_id)) {
    const h = m.id * 7 + g.id * 3; // deterministic, reruns identical
    rows.push({
      game_id: g.id, division_id: div.id, team_id: m.team_id, team_member_id: m.id,
      pts: h % 19, reb: (h >> 2) % 10, ast: (h >> 4) % 7,
    });
  }
}
// merge-duplicates upsert keyed on the (game_id, team_member_id) unique
await post(`game_stat_lines?on_conflict=game_id,team_member_id`, rows);
await patch(`divisions?id=eq.${div.id}`, { stats_enabled: true });
console.log(`seeded ${rows.length} stat lines across ${games.length} final games; stats ON for division ${div.id} (${div.name})`);
