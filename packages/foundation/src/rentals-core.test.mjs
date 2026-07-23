/**
 * Rental schedule + status state machine tests (Module 3 Stage 4).
 * Run: npm run test:rentals
 */
import {
  buildDefaultSchedule,
  buildPlanSchedule,
  equalInstallments,
  canTransition,
  deriveStatus,
} from './__compiled__/rentals-core.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ` - ${detail}`}`);
  cond ? pass++ : fail++;
};
const sum = (s) => s.reduce((a, e) => a + e.amount_cents, 0);

// --- default schedule: deposit due 5 business days out ---------------------
{
  // Booked Fri 2026-07-24; +5 business days = Fri 2026-07-31 (skips weekend).
  const s = buildDefaultSchedule(100000, 25, '2026-07-24', '2026-09-01');
  ok('default: two installments', s.length === 2);
  ok('default: deposit 25% = $250', s[0].amount_cents === 25000 && s[0].is_deposit);
  ok('default: balance = remainder', s[1].amount_cents === 75000 && !s[1].is_deposit);
  ok('default: deposit due +5 business days', s[0].due_date === '2026-07-31', s[0].due_date);
  ok('default: sums to total', sum(s) === 100000);
}

// --- custom plan: pct + amount, last absorbs rounding ----------------------
{
  const s = buildPlanSchedule(100000, [
    { pct: 30, dueDate: '2026-08-01' },
    { pct: 30, dueDate: '2026-09-01' },
    { pct: 40, dueDate: '2026-10-01' },
  ]);
  ok('plan: 3 installments sum to total', sum(s) === 100000 && s.length === 3);
  ok('plan: first is deposit', s[0].is_deposit && !s[1].is_deposit);
}
{
  // 3-way split of an amount that doesn't divide evenly ($100.00 / 3)
  const s = buildPlanSchedule(10000, [
    { pct: 33.33, dueDate: '2026-08-01' },
    { pct: 33.33, dueDate: '2026-09-01' },
    { pct: 33.34, dueDate: '2026-10-01' },
  ]);
  ok('plan: rounding absorbed, exact total', sum(s) === 10000, `sum=${sum(s)}`);
}
{
  let threw = false;
  try { buildPlanSchedule(10000, [{ amountCents: 6000, dueDate: 'x' }, { amountCents: 6000, dueDate: 'y' }]); } catch { threw = true; }
  ok('plan: overshoot rejected', threw);
}

// --- equal installments (5 payments over 5 months) -------------------------
{
  const s = equalInstallments(100000, 5, '2026-08-01', 30);
  ok('equal: 5 installments sum to total', s.length === 5 && sum(s) === 100000, `sum=${sum(s)}`);
  ok('equal: dates step by 30 days', s[1].due_date === '2026-08-31' && s[4].due_date === '2026-11-29', `${s[1].due_date}..${s[4].due_date}`);
}

// --- state machine transitions --------------------------------------------
ok('sm: quote->deposit_due legal', canTransition('quote', 'deposit_due'));
ok('sm: quote->paid illegal', !canTransition('quote', 'paid'));
ok('sm: deposit_due->overdue legal', canTransition('deposit_due', 'overdue'));
ok('sm: overdue->paid (recover) legal', canTransition('overdue', 'paid'));
ok('sm: paid->cancelled legal (deposit non-refundable)', canTransition('paid', 'cancelled'));
ok('sm: cancelled terminal', !canTransition('cancelled', 'quote'));

// --- deriveStatus ----------------------------------------------------------
const dep = (status, due) => ({ amount_cents: 25000, due_date: due, is_deposit: true, status });
const bal = (status, due) => ({ amount_cents: 75000, due_date: due, is_deposit: false, status });
const today = '2026-08-15';

ok('derive: cancelled wins', deriveStatus([dep('paid', '2026-08-01')], today, true) === 'cancelled');
ok('derive: all paid -> paid', deriveStatus([dep('paid', '2026-08-01'), bal('paid', '2026-08-10')], today, false) === 'paid');
ok('derive: deposit pending, not yet due -> deposit_due', deriveStatus([dep('pending', '2026-08-20'), bal('pending', '2026-09-01')], today, false) === 'deposit_due');
ok('derive: deposit paid, balance pending -> balance_due', deriveStatus([dep('paid', '2026-08-01'), bal('pending', '2026-09-01')], today, false) === 'balance_due');
ok('derive: pending past due -> overdue', deriveStatus([dep('pending', '2026-08-01'), bal('pending', '2026-09-01')], today, false) === 'overdue');
ok('derive: failed installment -> overdue', deriveStatus([dep('failed', '2026-08-20')], today, false) === 'overdue');
ok('derive: waived treated as settled', deriveStatus([dep('waived', '2026-08-01'), bal('paid', '2026-08-10')], today, false) === 'paid');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
