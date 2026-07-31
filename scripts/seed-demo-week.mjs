#!/usr/bin/env node
/**
 * Seed a believable week of bookings so the schedule, Gantt, conflicts queue
 * and TV display can be designed against real density instead of empty states.
 *
 * Every row is tagged source_ref = 'demo:week' and created_by = 'system:demo-seed',
 * so removal is exact and total:
 *
 *   node scripts/seed-demo-week.mjs          # clear + reseed the current week
 *   node scripts/seed-demo-week.mjs --clear  # remove every demo booking
 *
 * This is DESIGN data, not test fixtures - it never runs in CI and touches
 * nothing but rows carrying the demo tag.
 */
import { readFileSync } from 'node:fs';

const TAG = 'demo:week';
const ACTOR = 'system:demo-seed';

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

// --- Toronto week maths -----------------------------------------------------
// Bookings are stored as instants; we build them from Toronto wall time. Late
// July / August is EDT (-04:00), which is when this demo week lives.
const OFFSET = '-04:00';

/** Monday of the current Toronto week, 'YYYY-MM-DD'. */
function mondayOfThisWeek() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = noonUTC.getUTCDay();              // 0 = Sun
  const back = dow === 0 ? 6 : dow - 1;         // walk back to Monday
  noonUTC.setUTCDate(noonUTC.getUTCDate() - back);
  return noonUTC.toISOString().slice(0, 10);
}

const MONDAY = mondayOfThisWeek();

/** ISO instant for `dayOffset` days after Monday at Toronto wall time HH:MM. */
function at(dayOffset, hhmm) {
  const [y, m, d] = MONDAY.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + dayOffset)).toISOString().slice(0, 10);
  return `${day}T${hhmm}:00${OFFSET}`;
}

// --- The week ---------------------------------------------------------------
// Shape chosen to exercise the views: overlapping parallel courts (Gantt
// density), a whole-facility booking (its own row), a tentative quote (hold
// styling), a deliberate collision (clash indicator + conflicts queue),
// buffers, public and private rows, and a quiet day.
const PLAN = [
  // Mon-Thu: academy mornings on the Fieldhouse halves, in parallel.
  ...[0, 1, 2, 3].flatMap((d) => [
    { day: d, from: '09:00', to: '11:00', facility: 'Fieldhouse North', title: 'OP Academy - Skill Development', source: 'program', public: true },
    { day: d, from: '09:00', to: '11:00', facility: 'Fieldhouse South', title: 'OP Academy - Strength Block', source: 'program', public: true },
  ]),

  // Weekday summer camp, whole Fieldhouse, with setup and teardown buffers.
  ...[0, 1, 2, 3, 4].map((d) => ({
    day: d, from: '12:00', to: '16:00', facility: 'Fieldhouse',
    title: 'Summer Hoops Camp - Week 5', source: 'program', public: true,
    setup: 30, cleanup: 30,
  })),

  // Evening club practices spread across the Dome courts.
  ...[0, 2].flatMap((d) => [
    { day: d, from: '18:00', to: '20:00', facility: 'Dome Court 1', title: 'Bears U14 Rep - Practice', source: 'program', public: true },
    { day: d, from: '18:00', to: '20:00', facility: 'Dome Court 2', title: 'Bears U16 Rep - Practice', source: 'program', public: true },
    { day: d, from: '20:00', to: '21:30', facility: 'Dome Court 1', title: 'Bears Volleyball - Practice', source: 'program', public: true },
  ]),

  // Two half-court bookings that together occupy Dome Court 3 - the signature
  // case the availability engine exists for.
  { day: 1, from: '18:00', to: '20:00', facility: 'Dome Court 3 - East Basket', title: 'Shooting Session - Guards', source: 'program', public: true },
  { day: 1, from: '18:00', to: '20:00', facility: 'Dome Court 3 - West Basket', title: 'Shooting Session - Bigs', source: 'program', public: true },

  // A private rental, hidden from the public schedule.
  { day: 3, from: '19:00', to: '22:00', facility: 'Dome Court 3', title: 'Dufferin Corporate League', source: 'rental', public: false },

  // A tentative quote holding Friday prime time.
  { day: 4, from: '18:00', to: '21:00', facility: 'Dome Court 2', title: 'Headwaters Youth Org - QUOTE HOLD', source: 'rental', status: 'tentative', public: false },

  // Deliberate collision on Friday: an internal ops block over a confirmed
  // program, so the clash indicator and conflicts queue both have a subject.
  { day: 4, from: '17:00', to: '19:00', facility: 'Dome Court 2', title: 'Floor Resurfacing', source: 'internal', internal: true, public: false },

  // Saturday: a tournament taking the whole Dome, plus OCS overflow.
  { day: 5, from: '08:00', to: '20:00', facility: 'Dome', title: 'All Canadian Games - Showcase Saturday', source: 'event', public: true, setup: 60, cleanup: 45 },
  { day: 5, from: '09:00', to: '15:00', facility: 'Orangeville Christian School', title: 'All Canadian Games - Overflow Pool', source: 'event', public: true },

  // Sunday: one quiet morning booking, then nothing - the calm day matters
  // visually as much as the busy one.
  { day: 6, from: '10:00', to: '12:00', facility: 'Fieldhouse North', title: 'Open Gym - Family Drop-In', source: 'program', public: true },
];

async function clearDemo() {
  await rest(`bookings?source_ref=eq.${encodeURIComponent(TAG)}`, { method: 'DELETE' });
}

async function main() {
  const clearOnly = process.argv.includes('--clear');

  await clearDemo();
  if (clearOnly) {
    console.log('demo bookings cleared');
    return;
  }

  const facilities = await rest('facilities?select=id,name&deleted_at=is.null');
  const idOf = (name) => {
    const f = facilities.find((x) => x.name === name);
    if (!f) throw new Error(`Facility not found: ${name}`);
    return f.id;
  };

  const rows = PLAN.map((p) => ({
    facility_id: idOf(p.facility),
    starts_at: at(p.day, p.from),
    ends_at: at(p.day, p.to),
    source: p.source,
    status: p.status ?? 'confirmed',
    is_internal: p.internal ?? false,
    title: p.title,
    show_on_public_schedule: p.public,
    source_ref: TAG,
    setup_minutes: p.setup ?? 0,
    cleanup_minutes: p.cleanup ?? 0,
    created_by: ACTOR,
  }));

  const made = await rest('bookings', { method: 'POST', body: JSON.stringify(rows) });
  console.log(`seeded ${made.length} demo bookings, week of ${MONDAY}`);
  console.log(`  public: ${rows.filter((r) => r.show_on_public_schedule).length}`);
  console.log(`  tentative: ${rows.filter((r) => r.status === 'tentative').length}`);
  console.log('remove with: node scripts/seed-demo-week.mjs --clear');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
