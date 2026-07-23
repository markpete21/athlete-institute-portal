/**
 * Staff pay scheduling (Module 5 Stage 5) - PURE, edge-safe. Generates the
 * schedule of pay DATES + amounts from an assignment's frequency + the program
 * run, and recomputes pay when a session is covered by a replacement. Tracking
 * only - never moves money.
 */

import { splitEvenly } from './money';

export type PayMode = 'hourly' | 'per_session' | 'flat' | 'salary';
export type PayFrequency = 'bi_weekly' | 'monthly' | 'after_program';

export interface PayScheduleInput {
  mode: PayMode;
  rateCents: number;
  frequency: PayFrequency;
  programStartISO: string;   // YYYY-MM-DD
  programEndISO: string;
  /** For per_session/hourly: total sessions (or hours) across the run. */
  units?: number;
}

export interface PayDate {
  dueDate: string;
  amountCents: number;
}

const addDaysISO = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const addMonthsISO = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
};

/** Total contract amount for the assignment. */
export function totalPayCents(input: Pick<PayScheduleInput, 'mode' | 'rateCents' | 'units'>): number {
  switch (input.mode) {
    case 'flat':
    case 'salary':
      return input.rateCents;
    case 'per_session':
    case 'hourly':
      return input.rateCents * (input.units ?? 0);
  }
}

/**
 * Generate pay dates. after_program => one payment on the end date.
 * bi_weekly/monthly => even split across the periods spanning the run (last
 * period absorbs rounding). salary is treated as the amount PER PERIOD.
 */
export function generatePaySchedule(input: PayScheduleInput): PayDate[] {
  const total = totalPayCents(input);
  if (input.frequency === 'after_program') {
    return [{ dueDate: input.programEndISO, amountCents: total }];
  }

  const stepDays = input.frequency === 'bi_weekly' ? 14 : 0;
  const dates: string[] = [];
  let cursor = input.programStartISO;
  // First pay date is one period AFTER the start (you're paid for work done).
  while (true) {
    cursor = input.frequency === 'bi_weekly' ? addDaysISO(cursor, stepDays) : addMonthsISO(cursor, 1);
    if (cursor > input.programEndISO) {
      if (dates.length === 0) dates.push(input.programEndISO);
      break;
    }
    dates.push(cursor);
  }

  if (input.mode === 'salary') {
    // Salary = amount per period.
    return dates.map((dueDate) => ({ dueDate, amountCents: input.rateCents }));
  }
  const parts = splitEvenly(total, dates.length);
  return dates.map((dueDate, i) => ({ dueDate, amountCents: parts[i] }));
}

/**
 * Recompute an assignment's per-session pay when some sessions were covered by
 * a replacement. Returns the original's owed + each replacement's owed.
 * (Only meaningful for per_session/hourly; flat/salary are unaffected here.)
 */
export interface AbsenceInput {
  mode: PayMode;
  originalRateCents: number;
  totalUnits: number;
  absences: Array<{ replacementRateCents: number }>;
}

export function recomputeWithAbsences(input: AbsenceInput): { originalCents: number; replacementCents: number } {
  if (input.mode !== 'per_session' && input.mode !== 'hourly') {
    return { originalCents: totalPayCents({ mode: input.mode, rateCents: input.originalRateCents, units: input.totalUnits }), replacementCents: 0 };
  }
  const covered = input.absences.length;
  const originalUnits = Math.max(0, input.totalUnits - covered);
  const originalCents = input.originalRateCents * originalUnits;
  const replacementCents = input.absences.reduce((a, b) => a + b.replacementRateCents, 0);
  return { originalCents, replacementCents };
}
