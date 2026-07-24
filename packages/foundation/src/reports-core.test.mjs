/**
 * Reporting engine tests (Module 14). Run: npm run test:reports
 */
import {
  agingBuckets, capacityLevel, conversionMetrics, marginBreakdown, monthInReviewWindow,
  periodStart, recognizeDeferredRevenue, revenueEarnedToDate, revenuePerCourtHour,
  seasonRetentionRate, utilizationPct, weekInReviewWindow,
} from './__compiled__/reports-core.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

// --- period windows --------------------------------------------------------
{
  ok('30d period start', periodStart('30d', '2026-07-31T00:00:00Z').startsWith('2026-07-01'));
  ok('1yr period start', periodStart('1yr', '2026-07-31T00:00:00Z').startsWith('2025-07-31'));
}

// --- week-in-review (prior Mon-Sun) ----------------------------------------
{
  // 2026-07-27 is a Monday. Prior completed week = Mon 2026-07-20 .. Sun 2026-07-26.
  const w = weekInReviewWindow('2026-07-27T09:00:00Z');
  ok('week-in-review prior Mon-Sun (from Monday)', w.startISO === '2026-07-20' && w.endISO === '2026-07-26', JSON.stringify(w));
  // From mid-week Thursday 2026-07-30, still reports the last completed week 07-20..07-26.
  const w2 = weekInReviewWindow('2026-07-30T09:00:00Z');
  ok('week-in-review from mid-week', w2.startISO === '2026-07-20' && w2.endISO === '2026-07-26', JSON.stringify(w2));
  // From a Sunday 2026-07-26, the prior completed week is 07-13..07-19.
  const w3 = weekInReviewWindow('2026-07-26T09:00:00Z');
  ok('week-in-review from Sunday', w3.startISO === '2026-07-13' && w3.endISO === '2026-07-19', JSON.stringify(w3));
}

// --- month-in-review -------------------------------------------------------
{
  const m = monthInReviewWindow('2026-07-05T00:00:00Z');
  ok('month-in-review = prior month', m.startISO === '2026-06-01' && m.endISO === '2026-06-30', JSON.stringify(m));
}

// --- deferred revenue ------------------------------------------------------
{
  // $12,000 tuition earned Sept 2026 - June 2027 = 10 months, $1,200/mo.
  const sched = recognizeDeferredRevenue(1200000, '2026-09-01', '2027-06-30');
  ok('deferred: 10 monthly recognitions', sched.length === 10, `${sched.length}`);
  ok('deferred: sums to total', sched.reduce((a, m) => a + m.amountCents, 0) === 1200000);
  ok('deferred: even $1200/mo', sched.every((m) => m.amountCents === 120000));
  ok('deferred: first month Sept 2026', sched[0].month === '2026-09');
  // Earned to Dec 2026 = 4 months (Sep,Oct,Nov,Dec) = $4800.
  ok('revenue earned-to-date', revenueEarnedToDate(sched, '2026-12-15') === 480000, `${revenueEarnedToDate(sched, '2026-12-15')}`);
}

// --- margin (itemized, no double count) ------------------------------------
{
  const m = marginBreakdown({
    revenueCents: 1000000,
    staffCostCents: 300000,
    qboExpenses: [{ category: 'Rent', amountCents: 100000 }, { category: 'Equipment', amountCents: 50000 }, { category: 'Staff Wages', amountCents: 300000 }],
    excludeCategories: ['Staff Wages'],
  });
  ok('margin excludes double-counted staff wages', m.expenseTotalCents === 150000, `${m.expenseTotalCents}`);
  ok('margin = rev - staff - expenses', m.marginCents === 1000000 - 300000 - 150000, `${m.marginCents}`);
  ok('margin itemized by category', m.expensesByCategory.length === 2 && m.expensesByCategory.some((e) => e.category === 'Rent'));
  ok('margin pct', Math.abs(m.marginPct - 0.55) < 1e-9, `${m.marginPct}`);
}

// --- aging -----------------------------------------------------------------
{
  const b = agingBuckets([
    { dueDate: '2026-07-25', balanceCents: 100 },  // 5 days overdue
    { dueDate: '2026-06-20', balanceCents: 200 },  // ~40 days
    { dueDate: '2026-05-10', balanceCents: 300 },  // ~80 days
    { dueDate: '2026-03-01', balanceCents: 400 },  // >90
    { dueDate: '2026-08-30', balanceCents: 999 },  // future -> current
  ], '2026-07-30');
  ok('aging buckets 30/60/90', b.d1_30 === 100 && b.d31_60 === 200 && b.d61_90 === 300 && b.d90plus === 400 && b.current === 999, JSON.stringify(b));
}

// --- conversion / retention ------------------------------------------------
{
  const c = conversionMetrics({ started: 200, completed: 150 });
  ok('conversion rate + abandoned', c.conversionRate === 0.75 && c.abandoned === 50 && c.abandonRate === 0.25);
  ok('retention rate', seasonRetentionRate([1, 2, 3, 4], [2, 3, 4, 5]) === 0.75);
}

// --- capacity nudges -------------------------------------------------------
{
  ok('capacity ok below threshold', capacityLevel({ active: 5, capacity: 10, waitlisted: 0 }) === 'ok');
  ok('capacity approaching at 80%', capacityLevel({ active: 8, capacity: 10, waitlisted: 0 }) === 'approaching');
  ok('capacity full', capacityLevel({ active: 10, capacity: 10, waitlisted: 0 }) === 'full');
  ok('waitlist forming', capacityLevel({ active: 10, capacity: 10, waitlisted: 2 }) === 'waitlist_forming');
  ok('no capacity = ok', capacityLevel({ active: 99, capacity: null, waitlisted: 0 }) === 'ok');
}

// --- utilization -----------------------------------------------------------
{
  ok('utilization pct', utilizationPct(30, 40) === 0.75);
  ok('utilization capped at 1', utilizationPct(50, 40) === 1);
  ok('revenue per court-hour', revenuePerCourtHour(100000, 40) === 2500);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
