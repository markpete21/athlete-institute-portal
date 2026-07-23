/**
 * Rental payment schedule + status state machine (Module 3 Stage 4) - PURE,
 * edge-safe, unit-tested. lib/rentals/payments.ts orchestrates the DB + Stripe
 * rails around these.
 */

import { splitEvenly } from './money';
import { addBusinessDays } from './dates';

// ---------------------------------------------------------------------------
// Status state machine
// ---------------------------------------------------------------------------

export type RentalStatus =
  | 'quote'
  | 'deposit_due'
  | 'balance_due'
  | 'overdue'
  | 'paid'
  | 'cancelled';

/** Distinct colors for the schedule/reports (spec: color-coded + filterable). */
export const RENTAL_STATUS_COLOR: Record<RentalStatus, string> = {
  quote: '#9ea1a1',
  deposit_due: '#9e8959',
  balance_due: '#5b7a9e',
  overdue: '#b4483c',
  paid: '#3f7a5b',
  cancelled: '#1e1e1e',
};

const ALLOWED: Record<RentalStatus, RentalStatus[]> = {
  quote: ['deposit_due', 'cancelled'],
  deposit_due: ['balance_due', 'overdue', 'paid', 'cancelled'],
  balance_due: ['overdue', 'paid', 'cancelled'],
  overdue: ['balance_due', 'paid', 'cancelled'],
  paid: ['cancelled'], // refund/cancel a paid rental (deposit non-refundable)
  cancelled: [],
};

export function canTransition(from: RentalStatus, to: RentalStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export interface InstallmentState {
  amount_cents: number;
  due_date: string; // YYYY-MM-DD
  is_deposit: boolean;
  status: 'pending' | 'paid' | 'failed' | 'waived';
}

/**
 * Derive the live rental status from its installments (post-booking). `today`
 * is a Toronto date (caller passes torontoToday()); a pending installment past
 * its due date, or any failed one, means overdue.
 */
export function deriveStatus(
  installments: InstallmentState[],
  today: string,
  cancelled: boolean,
): RentalStatus {
  if (cancelled) return 'cancelled';
  if (installments.length === 0) return 'deposit_due';

  const owed = installments.filter((i) => i.status !== 'paid' && i.status !== 'waived');
  if (owed.length === 0) return 'paid';

  const anyOverdue = owed.some((i) => i.status === 'failed' || i.due_date < today);
  if (anyOverdue) return 'overdue';

  const depositSettled = installments
    .filter((i) => i.is_deposit)
    .every((i) => i.status === 'paid' || i.status === 'waived');
  return depositSettled ? 'balance_due' : 'deposit_due';
}

// ---------------------------------------------------------------------------
// Schedule building
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  seq: number;
  label: string;
  amount_cents: number;
  due_date: string;
  is_deposit: boolean;
}

/** Default: deposit (pct of total) + balance. Deposit due 5 business days out. */
export function buildDefaultSchedule(
  totalCents: number,
  depositPct: number,
  bookedTodayISO: string,
  balanceDueISO: string,
): ScheduleEntry[] {
  const deposit = Math.round((totalCents * depositPct) / 100);
  return [
    {
      seq: 1,
      label: `Deposit (${depositPct}%)`,
      amount_cents: deposit,
      due_date: addBusinessDays(bookedTodayISO, 5),
      is_deposit: true,
    },
    {
      seq: 2,
      label: 'Balance',
      amount_cents: totalCents - deposit,
      due_date: balanceDueISO,
      is_deposit: false,
    },
  ];
}

export interface PlanEntryInput {
  label?: string;
  /** Provide EITHER pct OR amountCents. */
  pct?: number;
  amountCents?: number;
  dueDate: string;
}

/**
 * Custom installment plan (e.g. 5 payments over 5 months). Resolves pct/amount
 * to cents; the LAST entry absorbs rounding so the schedule sums to exactly the
 * total. First entry is flagged the deposit. Throws if amounts overshoot total.
 */
export function buildPlanSchedule(totalCents: number, entries: PlanEntryInput[]): ScheduleEntry[] {
  if (entries.length === 0) throw new Error('Plan needs at least one installment.');

  const raw = entries.map((e) => {
    if (e.amountCents != null) return e.amountCents;
    if (e.pct != null) return Math.round((totalCents * e.pct) / 100);
    throw new Error('Each plan entry needs pct or amountCents.');
  });
  if (raw.some((c) => c < 0)) throw new Error('Installment amounts must be non-negative.');

  // Absorb only pct-rounding drift into the last entry (tolerance: 1 cent per
  // entry). A larger discrepancy means the amounts genuinely don't sum to the
  // total - reject rather than silently rewrite the last payment.
  const total = raw.reduce((a, b) => a + b, 0);
  const drift = totalCents - total;
  if (Math.abs(drift) > entries.length) {
    throw new Error(`Installments sum to ${total}, expected ${totalCents}.`);
  }
  raw[raw.length - 1] += drift;
  if (raw[raw.length - 1] < 0) throw new Error('Last installment would be negative.');

  return entries.map((e, i) => ({
    seq: i + 1,
    label: e.label ?? (i === 0 ? 'Deposit' : `Payment ${i + 1}`),
    amount_cents: raw[i],
    due_date: e.dueDate,
    is_deposit: i === 0,
  }));
}

/** N equal payments starting `firstDueISO`, `intervalDays` apart (last absorbs rounding). */
export function equalInstallments(
  totalCents: number,
  n: number,
  firstDueISO: string,
  intervalDays: number,
): ScheduleEntry[] {
  const parts = splitEvenly(totalCents, n);
  const [y, m, d] = firstDueISO.split('-').map(Number);
  return parts.map((amount, i) => ({
    seq: i + 1,
    label: i === 0 ? 'Deposit' : `Payment ${i + 1}`,
    amount_cents: amount,
    due_date: new Date(Date.UTC(y, m - 1, d + i * intervalDays)).toISOString().slice(0, 10),
    is_deposit: i === 0,
  }));
}
