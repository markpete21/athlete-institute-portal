/**
 * Tax (Module 0 §9) — Canadian/Ontario HST. PURE + edge-safe.
 *
 * Athlete Institute is in Orangeville, Ontario → HST 13%. Used by rentals,
 * programs, and checkout. Taxability itself (some registrations may be exempt)
 * is decided by the caller; this module only does the math, in cents.
 */

import { applyPercent } from './money';

/** Ontario HST rate (%). */
export const ONTARIO_HST_PERCENT = 13;

export interface TaxBreakdown {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  ratePercent: number;
}

/** HST on a subtotal (cents), rounded to the nearest cent. */
export function hstCents(subtotalCents: number, ratePercent = ONTARIO_HST_PERCENT): number {
  return applyPercent(subtotalCents, ratePercent);
}

/** Full breakdown: subtotal + HST → total (all cents). */
export function withHst(subtotalCents: number, ratePercent = ONTARIO_HST_PERCENT): TaxBreakdown {
  const taxCents = hstCents(subtotalCents, ratePercent);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    ratePercent,
  };
}
