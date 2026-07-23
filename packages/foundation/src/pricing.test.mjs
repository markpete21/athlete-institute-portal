/**
 * Worked-example tests for the canonical pricing function (Module 1 Stage 4).
 * Run: npm run test:pricing  (compiles pricing.ts, executes this against it)
 */
import { price } from './__compiled__/pricing.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};
const throws = (name, fn, msgPart) => {
  try { fn(); console.log(`✗ ${name} — did not throw`); fail++; }
  catch (e) {
    const ok = e.message.includes(msgPart);
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — wrong error: ${e.message}`}`);
    ok ? pass++ : fail++;
  }
};

// ── 1. Canonical order on a single program line ─────────────────────────────
// $100 base + $15 late − $10 returning − $5 multi = $100 subtotal;
// staff credit $40 → $60; CoA $10 → $50; points: cap 50% of $100 = $50,
// remaining $50 → apply $50 → $0 total.
{
  const r = price(
    [{ id: 'a', kind: 'program', programType: 'league', basePriceCents: 10000, lateFeeCents: 1500, returningAthleteDiscountCents: 1000, multiMemberDiscountCents: 500 }],
    { staffCreditCents: 4000, creditOnAccountCents: 1000, playPoints: 99999 },
  );
  eq('order: subtotal after program adjustments', r.lines[0].lineSubtotalCents, 10000);
  eq('order: staff credit applied', r.staffCreditUsedCents, 4000);
  eq('order: CoA applied after staff credit', r.creditOnAccountUsedCents, 1000);
  eq('order: points capped at 50% of line price', r.playPointsUsed, 5000);
  eq('order: total', r.totalCents, 0);
}

// ── 2. Rule 3: staff credit XOR promo ───────────────────────────────────────
throws('staff credit + promo rejected', () => price(
  [{ id: 'a', kind: 'program', basePriceCents: 10000 }],
  { staffCreditCents: 1000, promoCents: 1000 },
), 'cannot be combined');

// ── 3. Rule 2: returning-athlete NOT blocked by the XOR ────────────────────
{
  const r = price(
    [{ id: 'a', kind: 'program', programType: 'league', basePriceCents: 10000, returningAthleteDiscountCents: 1000 }],
    { promoCents: 2000 },
  );
  eq('returning applies alongside promo', r.lines[0].returningAthleteDiscountCents, 1000);
  eq('promo applies after program adjustments', r.totalCents, 10000 - 1000 - 2000);
}

// ── 4. Rule 1 + 5: scholarship on academy/club only ─────────────────────────
{
  const academy = price([{ id: 'a', kind: 'program', programType: 'academy', basePriceCents: 500000, scholarshipCents: 100000 }]);
  eq('academy scholarship applied', academy.lines[0].scholarshipCents, 100000);
  const league = price([{ id: 'a', kind: 'program', programType: 'league', basePriceCents: 10000, scholarshipCents: 5000 }]);
  eq('league scholarship NOT applied (ineligible)', league.lines[0].scholarshipCents, 0);
  const club = price([{ id: 'a', kind: 'program', programType: 'club', basePriceCents: 200000, scholarshipCents: 50000 }]);
  eq('club scholarship applied', club.lines[0].scholarshipCents, 50000);
  // extensible flag: a future type opts in without code changes
  const custom = price([{ id: 'a', kind: 'program', programType: 'elite', basePriceCents: 10000, scholarshipCents: 2000, scholarshipEligible: true }]);
  eq('explicit eligibility flag honored', custom.lines[0].scholarshipCents, 2000);
}

// ── 5. Rule 5: points scope — never on academy/club/rentals ────────────────
{
  const r = price(
    [
      { id: 'league', kind: 'program', programType: 'league', basePriceCents: 10000 },
      { id: 'academy', kind: 'program', programType: 'academy', basePriceCents: 500000 },
      { id: 'club', kind: 'program', programType: 'club', basePriceCents: 200000 },
      { id: 'rental', kind: 'rental', basePriceCents: 15000 },
    ],
    { playPoints: 999999 },
  );
  eq('points on league line only', r.lines.map((l) => l.playPointsApplied), [5000, 0, 0, 0]);
  eq('points used total', r.playPointsUsed, 5000);
}

// ── 6. Rule 5: staff credit never on rentals ────────────────────────────────
{
  const r = price(
    [
      { id: 'rental', kind: 'rental', basePriceCents: 15000 },
      { id: 'academy', kind: 'program', programType: 'academy', basePriceCents: 100000 },
    ],
    { staffCreditCents: 20000 },
  );
  eq('rental untouched by staff credit', r.lines[0].staffCreditAppliedCents, 0);
  eq('staff credit ok on academy (program registration)', r.lines[1].staffCreditAppliedCents, 20000);
}

// ── 7. Rule 4: CoA before points ────────────────────────────────────────────
{
  const r = price(
    [{ id: 'a', kind: 'program', programType: 'league', basePriceCents: 10000 }],
    { creditOnAccountCents: 8000, playPoints: 99999 },
  );
  // CoA takes 8000 first; points capped at min(50% of 10000, remaining 2000) = 2000
  eq('CoA drains before points', [r.creditOnAccountUsedCents, r.playPointsUsed], [8000, 2000]);
  eq('total zero', r.totalCents, 0);
}

// ── 8. Never below zero; balances drain across lines in order ──────────────
{
  const r = price(
    [
      { id: 'a', kind: 'program', programType: 'league', basePriceCents: 3000 },
      { id: 'b', kind: 'program', programType: 'league', basePriceCents: 4000 },
    ],
    { creditOnAccountCents: 50000 },
  );
  eq('lines never negative', r.lines.map((l) => l.totalCents), [0, 0]);
  eq('CoA used = what was owed, not the pool', r.creditOnAccountUsedCents, 7000);
}

// ── 9. Discounts clamp at zero (no negative subtotal) ───────────────────────
{
  const r = price([{ id: 'a', kind: 'program', programType: 'league', basePriceCents: 1000, returningAthleteDiscountCents: 5000 }]);
  eq('oversized discount clamps line to zero', r.lines[0].lineSubtotalCents, 0);
  eq('applied discount reported as clamped amount', r.lines[0].returningAthleteDiscountCents, 1000);
}

// ── 10. Points cap uses the 50%-of-line-price base, odd cents floor ────────
{
  const r = price(
    [{ id: 'a', kind: 'program', programType: 'league', basePriceCents: 9999 }],
    { playPoints: 99999 },
  );
  eq('odd-cent cap floors (4999 not 4999.5)', r.playPointsUsed, 4999);
}

// ── 11. Validation: floats and negatives rejected ───────────────────────────
throws('float cents rejected', () => price([{ id: 'a', kind: 'program', basePriceCents: 100.5 }]), 'non-negative integer');
throws('negative context rejected', () => price([{ id: 'a', kind: 'program', basePriceCents: 100 }], { playPoints: -5 }), 'non-negative integer');

// ── 12. Full worked example: staff family cart ──────────────────────────────
// League reg $120 late $10 returning $15 multi $10 → $105
// Academy $5000 scholarship $1000 → $4000 | Rental $150 → $150
// Staff credit $100: league $105→first… drains 100 on league → league $5
// CoA $50: league 5 → 0, academy 4000→3955... order: line order drain.
{
  const r = price(
    [
      { id: 'league', kind: 'program', programType: 'league', basePriceCents: 12000, lateFeeCents: 1000, returningAthleteDiscountCents: 1500, multiMemberDiscountCents: 1000 },
      { id: 'academy', kind: 'program', programType: 'academy', basePriceCents: 500000, scholarshipCents: 100000 },
      { id: 'rental', kind: 'rental', basePriceCents: 15000 },
    ],
    { staffCreditCents: 10000, creditOnAccountCents: 5000, playPoints: 20000 },
  );
  eq('worked: league subtotal', r.lines[0].lineSubtotalCents, 10500);
  eq('worked: staff credit → league then academy', [r.lines[0].staffCreditAppliedCents, r.lines[1].staffCreditAppliedCents, r.lines[2].staffCreditAppliedCents], [10000, 0, 0]);
  eq('worked: CoA order league→academy→rental', [r.lines[0].creditOnAccountAppliedCents, r.lines[1].creditOnAccountAppliedCents], [500, 4500]);
  eq('worked: points only on league, capped vs remaining 0', r.lines[0].playPointsApplied, 0);
  eq('worked: total', r.totalCents, 10500 + 400000 + 15000 - 10000 - 5000);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
