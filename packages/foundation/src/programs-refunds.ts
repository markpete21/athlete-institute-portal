/**
 * Refund / proration engine (Module 4 Stage 7) - PURE, edge-safe. Encodes the
 * Athlete Institute Registration, Refund & Withdrawal Policy as the DEFAULT;
 * staff always see this auto-calculated amount + the rule text and can override
 * to any amount (the override lives in the lib layer).
 *
 * Applies to all program types EXCEPT Club and Academy (their own handling).
 *
 * NOTE ON THE FORMULAS: the proration steps are encoded EXACTLY as written in
 * the policy - including the league "+$40 add-back" and the camp "+deposit
 * add-back" final steps. If those add-backs don't match intent (e.g. a
 * non-refundable fee/deposit being added back into the customer's amount),
 * that's a policy-text question for staff - and every result is overridable.
 */

import type { ProrationMethod } from './programs-core';

export const LEAGUE_UNIFORM_FEE_CENTS = 4000;   // $40 uniform & roster mgmt fee
export const CAMP_DEPOSIT_PCT = 20;
export const CAMP_DEPOSIT_MAX_CENTS = 50000;    // $500 cap
export const ADMIN_FEE_PCT = 10;

export function campDepositCents(feeCents: number): number {
  return Math.min(Math.round((feeCents * CAMP_DEPOSIT_PCT) / 100), CAMP_DEPOSIT_MAX_CENTS);
}

// --- Proration formulas (encoded exactly as the policy states) --------------

/** Leagues: (fee - $40)/sessions × remaining + $40. */
export function prorateLeague(feeCents: number, totalSessions: number, sessionsRemaining: number): number {
  if (totalSessions <= 0) return 0;
  const perSession = (feeCents - LEAGUE_UNIFORM_FEE_CENTS) / totalSessions;
  return Math.round(perSession * sessionsRemaining) + LEAGUE_UNIFORM_FEE_CENTS;
}

/** Clinics: fee/sessions × remaining. */
export function prorateClinic(feeCents: number, totalSessions: number, sessionsRemaining: number): number {
  if (totalSessions <= 0) return 0;
  return Math.round((feeCents / totalSessions) * sessionsRemaining);
}

/** Camps: (fee - deposit)/days × daysRemaining + deposit (deposit = 20%, max $500). */
export function prorateCamp(feeCents: number, totalDays: number, daysRemaining: number): number {
  if (totalDays <= 0) return 0;
  const deposit = campDepositCents(feeCents);
  return Math.round(((feeCents - deposit) / totalDays) * daysRemaining) + deposit;
}

/** Pickup/Drop-In: fee/purchased × remaining. */
export function prorateDropin(feeCents: number, sessionsPurchased: number, sessionsRemaining: number): number {
  if (sessionsPurchased <= 0) return 0;
  return Math.round((feeCents / sessionsPurchased) * sessionsRemaining);
}

// --- Full refund decision ---------------------------------------------------

export type RefundException = 'injury_medical' | 'weather' | 'ai_reschedule' | 'special' | null;

export interface RefundInput {
  method: ProrationMethod;
  feeCents: number;              // pre-tax program cost paid
  startDateISO: string;         // program start (YYYY-MM-DD)
  withdrawalDateISO: string;    // when withdrawing (YYYY-MM-DD)
  totalUnits: number;           // sessions (league/clinic/dropin) or days (camp)
  unitsRemaining: number;       // sessions/days not yet used
  unitsElapsed: number;         // sessions/days already run (for the proration trigger)
  refundInsurance?: boolean;
  exception?: RefundException;
}

export interface RefundResult {
  /** Value used as the basis before admin fee (full fee or prorated). */
  proratedBaseCents: number;
  /** What can go to Credit on Account (fee-free path). */
  creditAmountCents: number;
  /** What can go back to card/PAD (0 when not refund-eligible). */
  refundAmountCents: number;
  adminFeeCents: number;
  refundEligible: boolean;      // may refund to original method (vs credit only)
  ruleText: string;            // the policy rule applied (shown to staff)
  discretionary: boolean;      // special request - staff must decide
}

const DAY = 86400_000;
const daysBetween = (aISO: string, bISO: string) => Math.round((Date.parse(bISO) - Date.parse(aISO)) / DAY);
const pct = (cents: number, p: number) => Math.round((cents * p) / 100);

/** Proration trigger per method: only prorate after these many units elapsed. */
function pastProrationTrigger(method: ProrationMethod, unitsElapsed: number): boolean {
  if (method === 'league') return unitsElapsed > 3;
  if (method === 'clinic' || method === 'camp') return unitsElapsed >= 1;
  if (method === 'dropin') return unitsElapsed >= 1;
  return false;
}

function proratedValue(input: RefundInput): number {
  switch (input.method) {
    case 'league': return prorateLeague(input.feeCents, input.totalUnits, input.unitsRemaining);
    case 'clinic': return prorateClinic(input.feeCents, input.totalUnits, input.unitsRemaining);
    case 'camp': return prorateCamp(input.feeCents, input.totalUnits, input.unitsRemaining);
    case 'dropin': return prorateDropin(input.feeCents, input.totalUnits, input.unitsRemaining);
    default: return input.feeCents;
  }
}

export function computeRefund(input: RefundInput): RefundResult {
  const daysToStart = daysBetween(input.withdrawalDateISO, input.startDateISO); // + = before start
  const beforeStart = daysToStart > 0;
  const none = (ruleText: string): RefundResult => ({ proratedBaseCents: 0, creditAmountCents: 0, refundAmountCents: 0, adminFeeCents: 0, refundEligible: false, ruleText, discretionary: false });

  // 1. Refund Insurance: full refund if withdrawing BEFORE the program begins.
  if (input.refundInsurance && beforeStart) {
    return { proratedBaseCents: input.feeCents, creditAmountCents: input.feeCents, refundAmountCents: input.feeCents, adminFeeCents: 0, refundEligible: true, ruleText: 'Refund Insurance — full refund before the program begins.', discretionary: false };
  }

  // 2. Exceptions override the standard table.
  if (input.exception === 'weather') {
    return none('Weather rescheduling — no refund or credit if unable to attend the reschedule.');
  }
  if (input.exception === 'injury_medical') {
    const base = pastProrationTrigger(input.method, input.unitsElapsed) ? proratedValue(input) : input.feeCents;
    return { proratedBaseCents: base, creditAmountCents: base, refundAmountCents: 0, adminFeeCents: 0, refundEligible: false, ruleText: 'Medical exception (physician note) — full prorated Credit on Account, no admin fee.', discretionary: false };
  }
  if (input.exception === 'ai_reschedule') {
    return { proratedBaseCents: input.feeCents, creditAmountCents: input.feeCents, refundAmountCents: 0, adminFeeCents: 0, refundEligible: false, ruleText: 'AI operational rescheduling — full Credit on Account.', discretionary: false };
  }

  const discretionary = input.exception === 'special';

  // 3. Standard withdrawal tables.
  if (input.method === 'camp') {
    const deposit = campDepositCents(input.feeCents);
    if (beforeStart && daysToStart > 30) {
      const adminFee = pct(input.feeCents, ADMIN_FEE_PCT);
      return { proratedBaseCents: input.feeCents, creditAmountCents: input.feeCents, refundAmountCents: input.feeCents - adminFee, adminFeeCents: adminFee, refundEligible: true, ruleText: 'Camp, >1 month before start — credit (no fee) or refund (10% admin fee).', discretionary };
    }
    if (beforeStart) {
      return { proratedBaseCents: input.feeCents, creditAmountCents: input.feeCents - deposit, refundAmountCents: 0, adminFeeCents: 0, refundEligible: false, ruleText: `Camp, <1 month before start — 20% deposit ($${(deposit / 100).toFixed(0)}, max $500) retained; remainder as credit, not refund-eligible.`, discretionary };
    }
    // after start: prorated credit, deposit retained (via the formula), not refund-eligible
    const base = proratedValue(input);
    return { proratedBaseCents: base, creditAmountCents: base, refundAmountCents: 0, adminFeeCents: 0, refundEligible: false, ruleText: 'Camp, after start — prorated credit; 20% deposit (max $500) retained; not refund-eligible.', discretionary };
  }

  // Leagues & Clinics (and default/other types use the same table).
  if (beforeStart && daysToStart > 14) {
    return { proratedBaseCents: input.feeCents, creditAmountCents: input.feeCents, refundAmountCents: input.feeCents, adminFeeCents: 0, refundEligible: true, ruleText: '>14 days before start — credit or refund, no admin fee.', discretionary };
  }
  if (beforeStart) {
    const adminFee = pct(input.feeCents, ADMIN_FEE_PCT);
    return { proratedBaseCents: input.feeCents, creditAmountCents: input.feeCents, refundAmountCents: input.feeCents - adminFee, adminFeeCents: adminFee, refundEligible: true, ruleText: '<14 days before start — credit (no fee) or refund (10% admin fee).', discretionary };
  }
  // after start
  const daysSinceStart = -daysToStart;
  if (daysSinceStart <= 14) {
    const base = pastProrationTrigger(input.method, input.unitsElapsed) ? proratedValue(input) : input.feeCents;
    const adminFee = pct(base, ADMIN_FEE_PCT);
    return { proratedBaseCents: base, creditAmountCents: base - adminFee, refundAmountCents: 0, adminFeeCents: adminFee, refundEligible: false, ruleText: '<14 days after start — prorated credit + 10% admin fee; not refund-eligible.', discretionary };
  }
  return none('>14 days after start — not eligible for refund or credit.');
}
