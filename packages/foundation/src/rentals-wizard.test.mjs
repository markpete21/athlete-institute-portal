import assert from 'node:assert/strict';
import { addonCents, defaultBalanceDue, lineOccurrences, lineTotalCents, lineValid, quoteTotals } from './__compiled__/rentals-wizard.js';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name} ${detail}`); } };

const fac = new Map([[1, { id: 1, name: 'Court A', depth: 1, hourlyCents: 10000, fullDayCents: 60000 }]]);
const line = { facilityId: 1, date: '2026-10-05', start: '18:00', end: '19:30', rateMode: 'hourly', rateOverride: '', repeatMode: 'none', repeatUntil: '', repeatDates: [], addons: {} };

ok('single line occurrence', lineOccurrences(line) === 1);
ok('weekly inclusive count', lineOccurrences({ ...line, repeatMode: 'weekly', repeatUntil: '2026-11-02' }) === 5);
ok('dates repeat = 1 + extras', lineOccurrences({ ...line, repeatMode: 'dates', repeatDates: ['2026-10-07', '2026-10-09'] }) === 3);
ok('hourly total = rate × hours', lineTotalCents(line, fac.get(1)) === 15000);
ok('override rate wins', lineTotalCents({ ...line, rateOverride: '80' }, fac.get(1)) === 12000);
ok('full day ignores hours', lineTotalCents({ ...line, rateMode: 'full_day' }, fac.get(1)) === 60000);
ok('flat add-on charged once regardless of qty', addonCents({ id: 1, name: 'Ref', pricingMode: 'flat', priceCents: 5000 }, 3, null) === 5000);
ok('per_unit multiplies', addonCents({ id: 1, name: 'Chairs', pricingMode: 'per_unit', priceCents: 200, }, 10, null) === 2000);
ok('per_hour uses block hours', addonCents({ id: 1, name: 'Scorekeeper', pricingMode: 'per_hour', priceCents: 2000 }, 1, 1.5) === 3000);

const totals = quoteTotals({ kind: 'rental', lines: [{ ...line, repeatMode: 'weekly', repeatUntil: '2026-10-19' }], facilities: fac, addons: [{ id: 9, name: 'Ref', pricingMode: 'flat', priceCents: 5000 }], addonQty: { 9: 2 }, depositPct: 25 });
ok('fees = 3 × 15000 + flat 5000', totals.feesCents === 50000, `${totals.feesCents}`);
ok('HST applied (13%)', totals.totalWithTaxCents === 56500, `${totals.totalWithTaxCents}`);
ok('deposit 25% of taxed total', totals.depositCents === 14125, `${totals.depositCents}`);
ok('internal kind is $0', quoteTotals({ kind: 'internal', lines: [line], facilities: fac, addons: [], addonQty: {}, depositPct: 25 }).feesCents === 0);
ok('missing rate flagged', quoteTotals({ kind: 'rental', lines: [{ ...line, facilityId: 2 }], facilities: fac, addons: [], addonQty: {}, depositPct: 25 }).missingRates);

ok('valid line', lineValid(line));
ok('end before start invalid', !lineValid({ ...line, end: '17:00' }));
ok('weekly without until invalid', !lineValid({ ...line, repeatMode: 'weekly' }));
ok('balance default: 10 business days before first booking', defaultBalanceDue('2026-10-19', '2026-09-01') === '2026-10-05');
ok('balance default never in the past', defaultBalanceDue('2026-09-02', '2026-09-01') === '2026-09-01');
ok('balance default without facility: 20 business days out', defaultBalanceDue(null, '2026-09-01') === '2026-09-29');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
