/**
 * Academy engine tests (Module 12). Run: npm run test:academy
 */
import {
  academyPlanSchedule, academyRetention, planCompletesBy, processingFeeCents,
  recalculateOwed, tuitionAfterScholarship,
} from './__compiled__/academy-core.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

// --- scholarship applied pre-plan ------------------------------------------
{
  ok('scholarship reduces tuition before plan', tuitionAfterScholarship(1500000, 300000) === 1200000);
  ok('partial scholarship allowed', tuitionAfterScholarship(1500000, 500) === 1499500);
  ok('scholarship never below zero', tuitionAfterScholarship(100000, 250000) === 0);
}

// --- plan front-loaded, completes by Feb 1 ---------------------------------
{
  // Enroll Sept; deposit $2000; post-scholarship tuition $12000. Plan Oct 1 -> Feb 1.
  const plan = academyPlanSchedule({ totalCents: 1200000, depositCents: 200000, firstDueISO: '2026-10-01', planCompleteByISO: '2027-02-01' });
  ok('deposit applied to tuition', plan.depositCents === 200000);
  ok('5 monthly installments Oct-Feb', plan.installments.length === 5, `${plan.installments.length}`);
  ok('installments sum to balance', plan.installments.reduce((a, i) => a + i.amountCents, 0) === 1000000);
  ok('plan completes by Feb 1', planCompletesBy(plan, '2027-02-01'));
  ok('last installment is Feb 1', plan.installments.at(-1).dueDate === '2027-02-01');
  ok('no installment after Feb 1', plan.installments.every((i) => i.dueDate <= '2027-02-01'));
}

// --- processing fee waived on PAD ------------------------------------------
{
  ok('card carries a processing fee (2.9%)', processingFeeCents(1000000, 'card', 2.9) === 29000);
  ok('PAD waives the fee', processingFeeCents(1000000, 'pad', 2.9) === 0);
}

// --- recalculate owed after a missed installment ---------------------------
{
  // 5 installments of $2000; first two paid, third missed. Recompute from Dec.
  const installments = [
    { dueDate: '2026-10-01', amountCents: 200000, paidCents: 200000 },
    { dueDate: '2026-11-01', amountCents: 200000, paidCents: 200000 },
    { dueDate: '2026-12-01', amountCents: 200000, paidCents: 0 },
    { dueDate: '2027-01-01', amountCents: 200000, paidCents: 0 },
    { dueDate: '2027-02-01', amountCents: 200000, paidCents: 0 },
  ];
  const r = recalculateOwed({ installments, asOfISO: '2026-12-01', planCompleteByISO: '2027-02-01' });
  ok('owed = unpaid balance', r.owedCents === 600000, `${r.owedCents}`);
  ok('re-split across remaining months (Dec-Feb)', r.reschedule.length === 3 && r.reschedule.reduce((a, i) => a + i.amountCents, 0) === 600000);
  ok('recalc still completes by Feb 1', r.reschedule.every((i) => i.dueDate <= '2027-02-01'));
}

// --- retention -------------------------------------------------------------
{
  ok('retention = returning / last season', academyRetention([1, 2, 3, 4], [2, 3, 4, 5, 6]) === 0.75, `${academyRetention([1, 2, 3, 4], [2, 3, 4, 5, 6])}`);
  ok('no prior season -> 0', academyRetention([], [1, 2]) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
