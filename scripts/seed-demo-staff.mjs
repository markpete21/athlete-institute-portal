#!/usr/bin/env node
/**
 * Seed believable staff so the Staff module screens can be looked at against
 * real data instead of empty states: the list with statuses, the detail page
 * with assignments/pay/absences/certs/unavailability, the pay dashboard's
 * period report + rollups, and the /play/staff self-view empty-vs-linked
 * distinction.
 *
 * What it paints (all on one demo program with real past+future sessions):
 *   - Marcus Bell   head coach, per-session bi-weekly pay, one PAID pay date,
 *                    one recorded absence covered by a sub, VSC expiring soon
 *   - Dana Okafor   account-less assistant (no email at all - the upgrade row)
 *   - Chris Yuen    the substitute (hidden Substitute assignment) + EXPIRED cert
 *   - Priya Shah    convenor on a flat/monthly structure, unavailability sent
 *
 * Every row is tagged created_by = 'system:demo-seed' (program share_token
 * demo-staff-league), so removal is exact and total:
 *
 *   node scripts/seed-demo-staff.mjs          # clear + reseed
 *   node scripts/seed-demo-staff.mjs --clear  # remove all demo staff data
 *
 * DESIGN data, not test fixtures - never runs in CI, touches nothing but rows
 * carrying the demo tag.
 */
import { readFileSync } from 'node:fs';

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
const get = (p) => rest(p);
const post = (p, body) => rest(p, { method: 'POST', body: JSON.stringify(body) });
const patch = (p, body) => rest(p, { method: 'PATCH', body: JSON.stringify(body) });
const del = (p) => rest(p, { method: 'DELETE' });

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const shift = (days) => {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// --- clear ------------------------------------------------------------------
const FAMILY_NAME = 'Staff Demo Family';
{
  const staff = await get(`staff?select=id&created_by=eq.${ACTOR}`);
  const progs = await get(`programs?select=id&share_token=like.demo-staff-league*`);
  if (staff?.length) {
    const ids = staff.map((s) => s.id).join(',');
    // assignments/pay/absences/certs/unavailability cascade off staff + program
    await del(`staff?id=in.(${ids})`);
  }
  // program delete cascades registrations + feedback rounds/responses
  if (progs?.length) await del(`programs?id=in.(${progs.map((p) => p.id).join(',')})`);
  const fams = await get(`families?select=id&name=eq.${encodeURIComponent(FAMILY_NAME)}`);
  if (fams?.length) await del(`families?id=in.(${fams.map((f) => f.id).join(',')})`);
  console.log(`cleared ${staff?.length ?? 0} demo staff + ${progs?.length ?? 0} demo program + ${fams?.length ?? 0} demo family`);
  if (process.argv.includes('--clear')) process.exit(0);
}

// --- program with a real session spine (3 past + 5 future Saturdays) ---------
const typeRows = await get(`program_types?select=id,key&key=eq.league`);
const leagueType = typeRows[0].id;
const program = (await post('programs', {
  name: 'Fall Development League', program_type_id: leagueType, category: 'Youth Sports',
  sport_tag: 'basketball', season_key: '2026:sep-dec', year: 2026, brand_key: 'athlete-institute',
  status: 'published', share_token: 'demo-staff-league', created_by: ACTOR,
}))[0];

// Saturdays relative to today so past/future and the pay-period report line up.
const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
const nextSat = (6 - dow + 7) % 7 || 7;
const sessionDates = [];
for (let w = -3; w <= 4; w++) sessionDates.push(shift(nextSat + w * 7 - 7)); // 3 past, this week, 4 ahead
await post('program_sessions', sessionDates.map((d) => ({
  program_id: program.id, starts_at: `${d}T10:00:00-04:00`, ends_at: `${d}T12:00:00-04:00`,
})));
const pastSessions = sessionDates.filter((d) => d < today);
const totalSessions = sessionDates.length;

// --- staff -------------------------------------------------------------------
const [marcus] = await post('staff', {
  first_name: 'Marcus', last_name: 'Bell', email: 'marcus.bell@example.test', phone: '(519) 555-0184', status: 'active', employment: 'employee',
  bio: 'Head coach with 12 years of youth development experience. Former OCAA guard; runs the fall league\'s skills curriculum and coaches our U13 rep group.',
  created_by: ACTOR,
});
const [dana] = await post('staff', {
  first_name: 'Dana', last_name: 'Okafor', status: 'active', employment: 'contractor',
  bio: 'Assistant coach for the fall league. Joined from the roster upload for the Bears Fall Classic.',
  created_by: ACTOR,
});
const [chris] = await post('staff', {
  first_name: 'Chris', last_name: 'Yuen', email: 'chris.yuen@example.test', phone: '(519) 555-0142', status: 'active', employment: 'contractor',
  bio: 'Development coach and regular substitute across youth programs.',
  created_by: ACTOR,
});
const [priya] = await post('staff', {
  first_name: 'Priya', last_name: 'Shah', email: 'priya.shah@example.test', phone: '(416) 555-0117', status: 'active', employment: 'employee',
  bio: 'League convenor - scheduling, scorekeeping and game-day operations.',
  created_by: ACTOR,
});

// --- assignments + generated pay ----------------------------------------------
// Marcus: per-session $60, bi-weekly. Schedule = every 2nd Saturday, even split.
const [aMarcus] = await post('staff_assignments', {
  staff_id: marcus.id, program_id: program.id, role_label: 'Head Coach',
  pay_mode: 'per_session', rate_cents: 6000, frequency: 'bi_weekly', show_public: true,
});
const marcusTotal = 6000 * totalSessions;
const payDates = sessionDates.filter((_, i) => i % 2 === 1); // every other Saturday
const per = Math.floor(marcusTotal / payDates.length);
const marcusPay = payDates.map((d, i) => ({
  assignment_id: aMarcus.id, due_date: d,
  amount_cents: i === payDates.length - 1 ? marcusTotal - per * (payDates.length - 1) : per,
}));
await post('staff_pay_dates', marcusPay);

// Dana: per-session $40, after-program single payment.
const [aDana] = await post('staff_assignments', {
  staff_id: dana.id, program_id: program.id, role_label: 'Assistant Coach',
  pay_mode: 'per_session', rate_cents: 4000, frequency: 'after_program', show_public: true,
});
await post('staff_pay_dates', [{ assignment_id: aDana.id, due_date: sessionDates[totalSessions - 1], amount_cents: 4000 * totalSessions }]);

// Priya: flat $500/month convenor.
const [aPriya] = await post('staff_assignments', {
  staff_id: priya.id, program_id: program.id, role_label: 'Convenor',
  pay_mode: 'salary', rate_cents: 50000, frequency: 'monthly', show_public: true,
});
await post('staff_pay_dates', [
  { assignment_id: aPriya.id, due_date: shift(nextSat - 7 + 14), amount_cents: 50000 },
  { assignment_id: aPriya.id, due_date: shift(nextSat - 7 + 44), amount_cents: 50000 },
]);

// --- absence: Marcus missed the most recent past Saturday, Chris covered ------
const absDate = pastSessions[pastSessions.length - 1];
const [aChris] = await post('staff_assignments', {
  staff_id: chris.id, program_id: program.id, role_label: 'Substitute',
  pay_mode: 'per_session', rate_cents: 7000, frequency: 'after_program', show_public: false,
});
await post('staff_session_absences', {
  assignment_id: aMarcus.id, session_date: absDate,
  replacement_staff_id: chris.id, replacement_rate_cents: 7000, created_by: ACTOR,
});
await post('staff_pay_dates', [{ assignment_id: aChris.id, due_date: absDate, amount_cents: 7000 }]);
// deduct Marcus's $60 from the pay date covering the session (mirror of recordAbsence)
const covering = marcusPay.find((p) => p.due_date >= absDate) ?? marcusPay[marcusPay.length - 1];
const coveringRows = await get(`staff_pay_dates?select=id,amount_cents&assignment_id=eq.${aMarcus.id}&due_date=eq.${covering.due_date}`);
await patch(`staff_pay_dates?id=eq.${coveringRows[0].id}`, { amount_cents: coveringRows[0].amount_cents - 6000 });

// settle Marcus's first (past) pay date so paid-vs-outstanding both show
const firstPay = await get(`staff_pay_dates?select=id&assignment_id=eq.${aMarcus.id}&order=due_date&limit=1`);
await patch(`staff_pay_dates?id=eq.${firstPay[0].id}`, { status: 'paid', paid_at: new Date().toISOString() });

// --- certifications -----------------------------------------------------------
await post('staff_certifications', [
  { staff_id: marcus.id, name: 'Vulnerable Sector Check', obtained_on: shift(-345), expires_on: shift(20) },   // amber: expiring
  { staff_id: marcus.id, name: 'Safe Sport Training', obtained_on: shift(-200), expires_on: shift(500) },      // ok
  { staff_id: chris.id, name: 'First Aid / CPR', obtained_on: shift(-800), expires_on: shift(-35) },           // red: expired
  { staff_id: priya.id, name: 'Vulnerable Sector Check', obtained_on: shift(-100), expires_on: shift(630) },   // ok
]);

// --- required certifications per role (fall program) --------------------------
// Head Coach needs VSC + Safe Sport (Marcus holds both); Assistant needs VSC
// (Dana holds none -> outstanding); Substitute needs First Aid (Chris's is
// EXPIRED -> outstanding, red).
const certTypes = await get('staff_certification_types?select=id,name');
const typeId = (n) => certTypes.find((t) => t.name === n)?.id;
await post('program_role_certifications', [
  { program_id: program.id, role_label: 'Head Coach', cert_type_id: typeId('Vulnerable Sector Check') },
  { program_id: program.id, role_label: 'Head Coach', cert_type_id: typeId('Safe Sport Training') },
  { program_id: program.id, role_label: 'Assistant Coach', cert_type_id: typeId('Vulnerable Sector Check') },
  { program_id: program.id, role_label: 'Convenor', cert_type_id: typeId('Vulnerable Sector Check') },
  { program_id: program.id, role_label: 'Substitute', cert_type_id: typeId('First Aid / CPR') },
]);
// link held demo certs to their catalog types (insert order matches names)
for (const [staffId, certName] of [[marcus.id, 'Vulnerable Sector Check'], [marcus.id, 'Safe Sport Training'], [chris.id, 'First Aid / CPR'], [priya.id, 'Vulnerable Sector Check']]) {
  await patch(`staff_certifications?staff_id=eq.${staffId}&name=eq.${encodeURIComponent(certName)}`, { cert_type_id: typeId(certName) });
}

// --- unavailability -------------------------------------------------------------
await post('staff_unavailability', [
  { staff_id: priya.id, date: shift(nextSat), note: 'family wedding' },
  { staff_id: chris.id, date: shift(10), note: null },
]);

// --- feedback (Module 15) so the staff Rating column has stars ----------------
const [family] = await post('families', { name: FAMILY_NAME });
const members = await post('family_members', [
  { family_id: family.id, first_name: 'Avery', last_name: 'Demo', member_role: 'dependent', dob: '2013-04-02' },
  { family_id: family.id, first_name: 'Blake', last_name: 'Demo', member_role: 'dependent', dob: '2012-09-18' },
  { family_id: family.id, first_name: 'Casey', last_name: 'Demo', member_role: 'dependent', dob: '2014-01-27' },
]);
const regs = await post('registrations', members.map((m) => ({
  program_id: program.id, family_member_id: m.id, family_id: family.id, standing: 'brand_new', status: 'active',
})));
const [round] = await post('feedback_rounds', { program_id: program.id, round: 'end', prompt_at: `${shift(-2)}T12:00:00-04:00` });
const RATINGS = [5, 4, 5];
const COMMENTS = ['Coach Marcus made every Saturday the highlight of the week.', null, 'Well run league, great communication about schedule changes.'];
await post('feedback_responses', regs.map((r, i) => ({
  round_id: round.id, program_id: program.id, registration_id: r.id, family_id: family.id,
  token: `demo-staff-fb-${r.id}`, rating: RATINGS[i], comment: COMMENTS[i], kind: RATINGS[i] && COMMENTS[i] ? 'full' : 'quick', submitted_at: `${shift(-1)}T12:00:00-04:00`,
})));

// --- a COMPLETED winter season so the re-registration rate has history --------
// Marcus coached 4 players in Jan-Apr; Avery/Blake/Casey came back for fall
// (registered above on the current program), Drew did not -> 75%.
const [winter] = await post('programs', {
  name: 'Winter Development League', program_type_id: leagueType, category: 'Youth Sports',
  sport_tag: 'basketball', season_key: '2026:jan-apr', year: 2026, brand_key: 'athlete-institute',
  status: 'archived', share_token: 'demo-staff-league-winter', created_by: ACTOR,
});
const [drew] = await post('family_members', { family_id: family.id, first_name: 'Drew', last_name: 'Demo', member_role: 'dependent', dob: '2013-11-05' });
await post('registrations', [...members, drew].map((m) => ({
  program_id: winter.id, family_member_id: m.id, family_id: family.id, standing: 'brand_new', status: 'active',
})));
const [aWinter] = await post('staff_assignments', {
  staff_id: marcus.id, program_id: winter.id, role_label: 'Head Coach',
  pay_mode: 'per_session', rate_cents: 5000, frequency: 'after_program', show_public: true, starts_on: '2026-01-10',
});
await post('staff_pay_dates', [{ assignment_id: aWinter.id, due_date: '2026-04-25', amount_cents: 40000, status: 'paid', paid_at: '2026-04-27T12:00:00-04:00' }]);

console.log(`seeded: program ${program.id} (${totalSessions} sessions) + winter ${winter.id}, staff Marcus ${marcus.id} / Dana ${dana.id} / Chris ${chris.id} / Priya ${priya.id}`);
console.log(`absence ${absDate} covered by Chris @ $70; Marcus first pay date marked paid`);
console.log(`feedback: 3 registrations + ratings ${RATINGS.join('/')} on program ${program.id} (family ${family.id})`);
