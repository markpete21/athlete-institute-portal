/**
 * Money (Module 0 §9) — cents-safe CAD arithmetic. PURE + edge-safe.
 *
 * THE RULE: money is always integer cents. Never store or compute money as a
 * float dollar amount — 0.1 + 0.2 !== 0.3. Every module (esp. the Module 1
 * pricing function and the Module 4 refund/proration engine) does its math in
 * cents through here and only formats to dollars at the edge.
 */

/** Parse a dollar input ("12.34", "$1,234.50", 12.34) to integer cents. */
export function dollarsToCents(input: string | number): number {
  const n = typeof input === 'number' ? input : Number(input.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`dollarsToCents: not a number: ${input}`);
  // Round through a string-free path that avoids float drift (e.g. 1.005).
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

/** Format cents as CAD currency, e.g. 123456 → "$1,234.56". */
export function formatCAD(cents: number): string {
  return CAD.format(centsToDollars(Math.round(cents)));
}

/** Sum a list of cent amounts (integer in, integer out). */
export function sumCents(amounts: number[]): number {
  return amounts.reduce((a, b) => a + Math.round(b), 0);
}

/**
 * Apply a percentage to a cent amount, rounded to the nearest cent.
 * e.g. applyPercent(10000, 15) → 1500 (15% of $100.00). Used for discounts,
 * tax, proration — always the single rounding point so totals reconcile.
 */
export function applyPercent(cents: number, percent: number): number {
  return Math.round(cents * (percent / 100));
}

/** Never let a running balance drop below zero (redemption/credit steps). */
export function clampNonNegative(cents: number): number {
  return cents < 0 ? 0 : cents;
}

/**
 * Split a cent amount into n installments that sum EXACTLY to the total
 * (remainder distributed to the earliest installments). For the Module 4
 * payment-plan engine: splitEvenly(10000, 3) → [3334, 3333, 3333].
 */
export function splitEvenly(totalCents: number, n: number): number[] {
  if (n <= 0) throw new Error('splitEvenly: n must be positive');
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  return Array.from({ length: n }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    return base + extra;
  });
}
