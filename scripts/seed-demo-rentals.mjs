#!/usr/bin/env node
/**
 * Seed believable rentals so the rentals finder, the invoices (accounts-
 * receivable) view and the printable documents can be looked at against real
 * data instead of empty states.
 *
 * Covers the states that actually differ on screen:
 *   - an open QUOTE (nothing owed yet, no instalments)
 *   - a booked rental with a PAID deposit and a future balance
 *   - a rental with an OVERDUE instalment (past its due date, still pending)
 *   - an internal $0 booking (no money, appears in the finder only)
 *
 * Every row is tagged created_by = 'system:demo-seed' and its title carries
 * the [demo] marker, so removal is exact and total:
 *
 *   node scripts/seed-demo-rentals.mjs          # clear + reseed
 *   node scripts/seed-demo-rentals.mjs --clear  # remove every demo rental
 *
 * DESIGN data, not test fixtures - it never runs in CI, never charges
 * anything, and touches nothing but rows carrying the demo tag.
 */
import { readFileSync } from 'node:fs';

const ACTOR = 'system:demo-seed';
const MARK = '[demo]';

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

const OFFSET = '-04:00';
const HST = 0.13;
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const shift = (days) => {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const at = (date, hh) => `${date}T${String(hh).padStart(2, '0')}:00:00${OFFSET}`;
const token = () => `demo${Math.random().toString(36).slice(2, 12)}`;

// --- clear ------------------------------------------------------------------
const existing = await rest(`rentals?select=id&created_by=eq.${ACTOR}`);
if (existing?.length) {
  const ids = existing.map((r) => r.id);
  const lines = await rest(`rental_lines?select=booking_id&rental_id=in.(${ids.join(',')})`);
  const bookingIds = (lines ?? []).map((l) => l.booking_id).filter(Boolean);
  if (bookingIds.length) {
    await rest(`bookings?id=in.(${bookingIds.join(',')})`, { method: 'DELETE' });
  }
  await rest(`rentals?id=in.(${ids.join(',')})`, { method: 'DELETE' });
  console.log(`cleared ${ids.length} demo rental(s) and ${bookingIds.length} booking(s)`);
}
if (process.argv.includes('--clear')) process.exit(0);

// --- facilities -------------------------------------------------------------
const facs = await rest('facilities?select=id,name&deleted_at=is.null');
const facId = (name) => facs.find((f) => f.name === name)?.id;

/** Create a rental + one priced line (and its booking) + optional instalments. */
async function seed({ title, contact, email, phone, type, isInternal, facility, date, from, to, hourly, depositPct, status, instalments }) {
  const hours = to - from;
  const subtotal = isInternal ? 0 : hourly * hours;
  const tax = isInternal ? 0 : Math.round(subtotal * HST);
  const total = subtotal + tax;
  const deposit = isInternal ? 0 : Math.round(total * (depositPct / 100));

  const [rental] = await rest('rentals', {
    method: 'POST',
    body: JSON.stringify({
      title: `${title} ${MARK}`,
      status,
      is_internal: isInternal,
      booking_type: type,
      contact_name: contact, contact_email: email, contact_phone: phone,
      deposit_pct: depositPct,
      subtotal_cents: subtotal, tax_cents: tax, total_cents: total, deposit_cents: deposit,
      quote_token: token(),
      created_by: ACTOR,
    }),
  });

  const fid = facId(facility);
  const [booking] = await rest('bookings', {
    method: 'POST',
    body: JSON.stringify({
      facility_id: fid,
      starts_at: at(date, from), ends_at: at(date, to),
      source: isInternal ? 'internal' : 'rental',
      status: status === 'quote' ? 'tentative' : 'confirmed',
      is_internal: isInternal,
      title: `${title} ${MARK}`,
      show_on_public_schedule: false,
      source_ref: `rental:${rental.id}`,
      created_by: ACTOR,
    }),
  });

  await rest('rental_lines', {
    method: 'POST',
    body: JSON.stringify({
      rental_id: rental.id, facility_id: fid, facility_name: facility,
      rate_mode: 'hourly', unit_rate_cents: isInternal ? 0 : hourly,
      starts_at: at(date, from), ends_at: at(date, to),
      line_total_cents: subtotal, booking_id: booking.id, sort_order: 0,
    }),
  });

  for (const [seq, inst] of (instalments ?? []).entries()) {
    await rest('rental_installments', {
      method: 'POST',
      body: JSON.stringify({
        rental_id: rental.id, seq: seq + 1,
        label: inst.label, amount_cents: inst.cents, due_date: inst.due,
        is_deposit: inst.deposit ?? false, status: inst.status,
        paid_at: inst.status === 'paid' ? `${inst.due}T15:00:00${OFFSET}` : null,
      }),
    });
  }
  console.log(`  #${rental.id}  ${title} — ${status}`);
  return rental.id;
}

console.log('seeding demo rentals...');

await seed({
  title: 'Headwaters Youth Basketball - Fall Skills Block', contact: 'Priya Raman',
  email: 'priya@headwatersyouth.example.ca', phone: '519-555-0142',
  type: 'clinic', isInternal: false, facility: 'Dome Court 2',
  date: shift(21), from: 18, to: 21, hourly: 14000, depositPct: 25, status: 'quote',
});

await seed({
  title: 'Dufferin Selects - Spring Invitational', contact: 'Marcus Bell',
  email: 'marcus.bell@dufferinselects.example.ca', phone: '519-555-0177',
  type: 'tournament', isInternal: false, facility: 'Fieldhouse Gym',
  date: shift(35), from: 8, to: 20, hourly: 18000, depositPct: 30, status: 'balance_due',
  instalments: [
    { label: 'Deposit (30%)', cents: 73224, due: shift(-14), deposit: true, status: 'paid' },
    { label: 'Balance', cents: 170856, due: shift(21), status: 'pending' },
  ],
});

await seed({
  title: 'Hillside Volleyball Club - Weekly Practice', contact: 'Alison Wu',
  email: 'alison@hillsidevb.example.ca', phone: '519-555-0198',
  type: 'league', isInternal: false, facility: 'Dome Court 1',
  date: shift(7), from: 19, to: 21, hourly: 12000, depositPct: 25, status: 'overdue',
  instalments: [
    { label: 'Deposit (25%)', cents: 6780, due: shift(-9), deposit: true, status: 'pending' },
    { label: 'Balance', cents: 20340, due: shift(14), status: 'pending' },
  ],
});

await seed({
  title: 'Bears Rep Tryouts - Staff Hold', contact: null,
  email: null, phone: null,
  type: 'event', isInternal: true, facility: 'Fieldhouse North',
  date: shift(10), from: 17, to: 20, hourly: 0, depositPct: 0, status: 'quote',
});

console.log('done. remove with: node scripts/seed-demo-rentals.mjs --clear');
