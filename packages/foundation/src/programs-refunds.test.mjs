/**
 * Refund/proration worked-example tests (Module 4 Stage 7), straight from the
 * policy. Run: npm run test:refunds
 */
import {
  prorateLeague, prorateClinic, prorateCamp, prorateDropin, campDepositCents, computeRefund,
} from './__compiled__/programs-refunds.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = got === want; console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${got} want ${want}`}`); ok ? pass++ : fail++; };
const ok = (name, cond, d = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ` - ${d}`}`); cond ? pass++ : fail++; };

// --- Proration formulas (exact) --------------------------------------------
// League: fee $240, 10 sessions, 4 remaining -> ((240-40)/10)*4 + 40 = 120
eq('league proration ($40 add-back)', prorateLeague(24000, 10, 4), 12000);
// Clinic: fee $150, 6 sessions, 2 remaining -> (150/6)*2 = 50
eq('clinic proration', prorateClinic(15000, 6, 2), 5000);
// Camp: fee $500, deposit 20%=$100 (<=$500), 5 days, 2 remaining -> ((500-100)/5)*2 + 100 = 260
eq('camp deposit (20%, max $500)', campDepositCents(50000), 10000);
eq('camp deposit capped at $500', campDepositCents(500000), 50000);
eq('camp proration (deposit add-back)', prorateCamp(50000, 5, 2), 26000);
// Drop-in: $200 for 10 sessions purchased, 3 remaining -> (200/10)*3 = 60
eq('drop-in proration', prorateDropin(20000, 10, 3), 6000);

// --- Withdrawal tables ------------------------------------------------------
const base = { feeCents: 24000, totalUnits: 10, unitsRemaining: 4, unitsElapsed: 6, startDateISO: '2026-10-01' };

// League >14 days before: full credit or refund, no fee
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-09-01' });
  ok('>14 before: full, no fee, refundable', r.creditAmountCents === 24000 && r.refundAmountCents === 24000 && r.adminFeeCents === 0 && r.refundEligible, JSON.stringify(r));
}
// League <14 days before: credit no fee / refund 10% fee
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-09-25' });
  ok('<14 before: credit full, refund -10%', r.creditAmountCents === 24000 && r.refundAmountCents === 21600 && r.adminFeeCents === 2400 && r.refundEligible, JSON.stringify(r));
}
// League <14 days after start (past 3 sessions): prorated credit + 10% fee, not refundable
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-10-10' });
  // prorated 12000, admin 1200, credit 10800, no refund
  ok('<14 after: prorated credit -10%, not refundable', r.proratedBaseCents === 12000 && r.creditAmountCents === 10800 && r.refundAmountCents === 0 && !r.refundEligible, JSON.stringify(r));
}
// League >14 days after start: not eligible
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-10-20' });
  ok('>14 after: not eligible', r.creditAmountCents === 0 && r.refundAmountCents === 0 && !r.refundEligible, JSON.stringify(r));
}

// Camp table
const camp = { feeCents: 50000, totalUnits: 5, unitsRemaining: 2, unitsElapsed: 2, startDateISO: '2026-08-01', method: 'camp' };
{
  const r = computeRefund({ ...camp, withdrawalDateISO: '2026-06-15' }); // >1 month before
  ok('camp >1mo before: full credit / refund -10%', r.creditAmountCents === 50000 && r.refundAmountCents === 45000 && r.refundEligible, JSON.stringify(r));
}
{
  const r = computeRefund({ ...camp, withdrawalDateISO: '2026-07-20' }); // <1 month before
  ok('camp <1mo before: deposit retained as credit, not refundable', r.creditAmountCents === 40000 && r.refundAmountCents === 0 && !r.refundEligible, JSON.stringify(r));
}
{
  const r = computeRefund({ ...camp, withdrawalDateISO: '2026-08-03' }); // after start
  ok('camp after start: prorated credit ($260), not refundable', r.creditAmountCents === 26000 && !r.refundEligible, JSON.stringify(r));
}

// --- Refund Insurance + exceptions -----------------------------------------
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-10-10', refundInsurance: true, startDateISO: '2026-10-20' }); // before start w/ insurance
  ok('refund insurance before start: full refund', r.refundAmountCents === 24000 && r.refundEligible, JSON.stringify(r));
}
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-10-10', exception: 'injury_medical' });
  ok('medical: full prorated credit, no fee, credit-only', r.creditAmountCents === 12000 && r.refundAmountCents === 0 && !r.refundEligible, JSON.stringify(r));
}
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-10-10', exception: 'weather' });
  ok('weather: nothing', r.creditAmountCents === 0 && r.refundAmountCents === 0, JSON.stringify(r));
}
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-10-10', exception: 'ai_reschedule' });
  ok('AI reschedule: full credit', r.creditAmountCents === 24000 && !r.refundEligible, JSON.stringify(r));
}
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-09-25', exception: 'special' });
  ok('special request flagged discretionary', r.discretionary === true, JSON.stringify(r));
}

// League early-after-start (<=3 sessions elapsed) -> no proration yet, full base
{
  const r = computeRefund({ ...base, method: 'league', withdrawalDateISO: '2026-10-05', unitsElapsed: 2 });
  ok('league <=3 sessions in: not yet prorated (full base)', r.proratedBaseCents === 24000, JSON.stringify(r));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
