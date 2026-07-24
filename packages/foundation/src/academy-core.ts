/**
 * Academy pure engine (Module 12). Tuition/scholarship/plan math with no I/O so
 * it is unit-testable. Enrollment/DB wiring lives in lib/academy. Money is in
 * integer cents throughout; scholarships apply BEFORE the plan is split.
 */
import { clampNonNegative, splitEvenly } from './money';

export type TuitionTier = 'room_board' | 'commuter' | 'international';
export type PaymentMethod = 'card' | 'pad';
export type AcademyStatus = 'selected' | 'offered' | 'accepted' | 'declined';

/** Tuition after a flat-rate (partial-allowed) scholarship. Never below zero. */
export function tuitionAfterScholarship(tuitionCents: number, scholarshipCents: number): number {
  return clampNonNegative(tuitionCents - scholarshipCents);
}

/**
 * The processing fee shown as a visible line item: charged on card, WAIVED on
 * PAD (bank debit) — PAD's lower cost is the incentive to connect it. Not a raw
 * card surcharge (see the compliance caveat in the module spec/README).
 */
export function processingFeeCents(baseCents: number, method: PaymentMethod, feePercent: number): number {
  if (method === 'pad') return 0;
  return Math.round((baseCents * feePercent) / 100);
}

export interface Installment { dueDate: string; amountCents: number }
export interface AcademyPlan { depositCents: number; installments: Installment[]; totalCents: number }

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Inclusive list of first-of-month dates from `fromISO`'s month to `toISO`'s month. */
function monthlyDueDates(fromISO: string, toISO: string): string[] {
  const [fy, fm] = fromISO.split('-').map(Number);
  const [ty, tm] = toISO.split('-').map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  // Safety bound: never emit more than 24 months.
  for (let i = 0; i < 24; i += 1) {
    if (y > ty || (y === ty && m > tm)) break;
    out.push(`${y}-${pad2(m)}-01`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Build a staff-dictated Academy payment plan. Tuition covers Sept-June but the
 * plan is FRONT-LOADED to complete by Feb 1 (planCompleteBy). A required deposit
 * (applied toward tuition) is taken up front; the remaining balance is split
 * evenly across the monthly installments from firstDue through planCompleteBy.
 * All installments fall on/before planCompleteBy (the "completes by Feb 1" rule).
 */
export function academyPlanSchedule(input: {
  totalCents: number;        // post-scholarship tuition + fees
  depositCents: number;      // required at enrollment, applied toward tuition
  firstDueISO: string;       // first monthly installment (YYYY-MM-DD)
  planCompleteByISO: string; // e.g. season-year Feb 1
}): AcademyPlan {
  const deposit = Math.min(clampNonNegative(input.depositCents), input.totalCents);
  const balance = clampNonNegative(input.totalCents - deposit);
  const dates = monthlyDueDates(input.firstDueISO, input.planCompleteByISO);
  if (dates.length === 0) {
    // Whole balance due by the completion date if the window is a single point.
    return { depositCents: deposit, installments: balance > 0 ? [{ dueDate: input.planCompleteByISO, amountCents: balance }] : [], totalCents: input.totalCents };
  }
  const amounts = splitEvenly(balance, dates.length);
  return {
    depositCents: deposit,
    installments: dates.map((dueDate, i) => ({ dueDate, amountCents: amounts[i] })),
    totalCents: input.totalCents,
  };
}

/** True if every installment completes on/before the target (the Feb-1 rule). */
export function planCompletesBy(plan: AcademyPlan, targetISO: string): boolean {
  return plan.installments.every((i) => i.dueDate <= targetISO);
}

/**
 * Recalculate total owed after missed installments: sum of unpaid installment
 * amounts minus any credit, re-split evenly across the remaining due dates
 * (on/before the completion target). The primary Academy use case.
 */
export function recalculateOwed(input: {
  installments: Array<{ dueDate: string; amountCents: number; paidCents: number }>;
  asOfISO: string;
  planCompleteByISO: string;
}): { owedCents: number; reschedule: Installment[] } {
  const owed = input.installments.reduce((a, i) => a + clampNonNegative(i.amountCents - i.paidCents), 0);
  const remainingDates = monthlyDueDates(input.asOfISO, input.planCompleteByISO);
  if (owed <= 0) return { owedCents: 0, reschedule: [] };
  if (remainingDates.length === 0) return { owedCents: owed, reschedule: [{ dueDate: input.planCompleteByISO, amountCents: owed }] };
  const amounts = splitEvenly(owed, remainingDates.length);
  return { owedCents: owed, reschedule: remainingDates.map((dueDate, i) => ({ dueDate, amountCents: amounts[i] })) };
}

/** Season-over-season retention: returning players / last season's players (0..1). */
export function academyRetention(lastSeasonMemberIds: number[], thisSeasonMemberIds: number[]): number {
  if (lastSeasonMemberIds.length === 0) return 0;
  const now = new Set(thisSeasonMemberIds);
  const returning = lastSeasonMemberIds.filter((id) => now.has(id)).length;
  return returning / lastSeasonMemberIds.length;
}
