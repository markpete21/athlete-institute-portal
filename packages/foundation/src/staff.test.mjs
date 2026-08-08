/**
 * Staff status, capability matrix, and pay-schedule tests (Module 5).
 * Run: npm run test:staff
 */
import { deriveStaffStatus, resolveCapabilities, can } from './__compiled__/staff-core.js';
import { generatePaySchedule, totalPayCents, recomputeWithAbsences, biWeeklyPeriod, shiftPeriod, originalOwedAfterReplacement } from './__compiled__/staff-pay.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);

// --- status derivation ------------------------------------------------------
ok('active: current assignment', deriveStaffStatus({ archived: false, hasCurrentOrUpcomingAssignment: true, hasOutstandingPay: false }) === 'active');
ok('active: outstanding pay keeps active', deriveStaffStatus({ archived: false, hasCurrentOrUpcomingAssignment: false, hasOutstandingPay: true }) === 'active');
ok('inactive: neither', deriveStaffStatus({ archived: false, hasCurrentOrUpcomingAssignment: false, hasOutstandingPay: false }) === 'inactive');
ok('archived wins', deriveStaffStatus({ archived: true, hasCurrentOrUpcomingAssignment: true, hasOutstandingPay: true }) === 'archived');

// --- capability matrix ------------------------------------------------------
{
  const coach = [{ capability: 'roster_names', can_view: true, can_edit: false }, { capability: 'score_entry', can_view: true, can_edit: true }];
  const admin = [{ capability: 'roster_sensitive', can_view: true, can_edit: true }];
  const both = resolveCapabilities([coach, admin]);
  ok('resolve: union across roles', can(both, 'roster_names') && can(both, 'score_entry', 'edit') && can(both, 'roster_sensitive', 'edit'));
  const coachOnly = resolveCapabilities([coach]);
  ok('sensitive fields OFF without an explicit grant', !can(coachOnly, 'roster_sensitive'));
  ok('unknown capability denied', !can(coachOnly, 'nope'));
}

// --- pay schedule -----------------------------------------------------------
eq('total: per-session x units', totalPayCents({ mode: 'per_session', rateCents: 5000, units: 8 }), 40000);
eq('total: flat', totalPayCents({ mode: 'flat', rateCents: 120000, units: 99 }), 120000);

{
  // after_program: one payment on end date
  const s = generatePaySchedule({ mode: 'per_session', rateCents: 5000, frequency: 'after_program', programStartISO: '2026-09-01', programEndISO: '2026-11-01', units: 8 });
  ok('after_program: single payment on end date', s.length === 1 && s[0].dueDate === '2026-11-01' && s[0].amountCents === 40000, JSON.stringify(s));
}
{
  // bi-weekly across ~2 months: even split summing to total
  const s = generatePaySchedule({ mode: 'flat', rateCents: 40000, frequency: 'bi_weekly', programStartISO: '2026-09-01', programEndISO: '2026-10-30', units: 0 });
  const sum = s.reduce((a, p) => a + p.amountCents, 0);
  ok('bi-weekly: dates every 14 days, sum = total', s.length >= 4 && sum === 40000 && s[0].dueDate === '2026-09-15', `${s.length} dates, sum ${sum}, first ${s[0]?.dueDate}`);
}
{
  // monthly salary = amount per period
  const s = generatePaySchedule({ mode: 'salary', rateCents: 100000, frequency: 'monthly', programStartISO: '2026-09-01', programEndISO: '2026-12-01' });
  ok('monthly salary: amount per period', s.every((p) => p.amountCents === 100000) && s.length === 3, `${s.length} @ ${s[0]?.amountCents}`);
}

// --- absence / replacement recompute ---------------------------------------
{
  // 8 sessions @ $50 original; 2 covered by replacement @ $60
  const r = recomputeWithAbsences({ mode: 'per_session', originalRateCents: 5000, totalUnits: 8, absences: [{ replacementRateCents: 6000 }, { replacementRateCents: 6000 }] });
  ok('absence: original loses covered sessions', r.originalCents === 6 * 5000, `orig ${r.originalCents}`);
  ok('absence: replacement paid entered rate', r.replacementCents === 2 * 6000, `repl ${r.replacementCents}`);
}
{
  const r = recomputeWithAbsences({ mode: 'flat', originalRateCents: 100000, totalUnits: 8, absences: [{ replacementRateCents: 6000 }] });
  ok('flat pay unaffected by per-session absence recompute', r.originalCents === 100000, JSON.stringify(r));
}

// --- bi-weekly pay periods ---------------------------------------------------
{
  // Anchor 2026-01-05 is a Monday; periods are Mon..Sun x2, org-wide.
  const p = biWeeklyPeriod('2026-01-05');
  eq('period: anchor date starts its own period', p, { startISO: '2026-01-05', endISO: '2026-01-18' });
  eq('period: last day belongs to same period', biWeeklyPeriod('2026-01-18'), { startISO: '2026-01-05', endISO: '2026-01-18' });
  eq('period: next day rolls over', biWeeklyPeriod('2026-01-19'), { startISO: '2026-01-19', endISO: '2026-02-01' });
  eq('period: date BEFORE the anchor still aligns', biWeeklyPeriod('2025-12-31'), { startISO: '2025-12-22', endISO: '2026-01-04' });
  const aug = biWeeklyPeriod('2026-08-07');
  const days = (Date.parse(aug.startISO) - Date.parse('2026-01-05')) / 86400_000;
  ok('period: months later still 14-day aligned to anchor', days % 14 === 0 && aug.startISO <= '2026-08-07' && aug.endISO >= '2026-08-07', JSON.stringify(aug));
  eq('period: shift forward', shiftPeriod(p, 1), { startISO: '2026-01-19', endISO: '2026-02-01' });
  eq('period: shift back', shiftPeriod(p, -1), { startISO: '2025-12-22', endISO: '2026-01-04' });
}

// --- replace-for-remainder owed math ----------------------------------------
{
  eq('remainder: per-session owed = rate x worked units',
    originalOwedAfterReplacement({ mode: 'per_session', rateCents: 5000, totalUnits: 10, unitsBefore: 4 }), 20000);
  eq('remainder: hourly same as per-session',
    originalOwedAfterReplacement({ mode: 'hourly', rateCents: 3000, totalUnits: 20, unitsBefore: 15 }), 45000);
  eq('remainder: flat prorated by worked fraction',
    originalOwedAfterReplacement({ mode: 'flat', rateCents: 100000, totalUnits: 8, unitsBefore: 2 }), 25000);
  eq('remainder: flat with no sessions falls back to full amount',
    originalOwedAfterReplacement({ mode: 'flat', rateCents: 100000, totalUnits: 0, unitsBefore: 0 }), 100000);
  eq('remainder: salary uses the schedule cut passed in',
    originalOwedAfterReplacement({ mode: 'salary', rateCents: 100000, totalUnits: 6, unitsBefore: 3, salaryOwedCents: 300000 }), 300000);
  eq('remainder: zero units worked owes zero',
    originalOwedAfterReplacement({ mode: 'per_session', rateCents: 5000, totalUnits: 10, unitsBefore: 0 }), 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
