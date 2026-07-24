/**
 * Reporting pure engine (Module 14). All financial/analytics math with no I/O so
 * it unit-tests deterministically. DB aggregation, QBO sync and PDF generation
 * live in lib/reports + lib/quickbooks. Money is integer cents throughout.
 */
import { splitEvenly } from './money';

// --- period windows ---------------------------------------------------------

export type Period = '24h' | '7d' | '30d' | '3mo' | '1yr';

/** Start ISO for a landing-dashboard period, relative to asOf (default now). */
export function periodStart(period: Period, asOfISO: string): string {
  const d = new Date(asOfISO);
  switch (period) {
    case '24h': d.setUTCDate(d.getUTCDate() - 1); break;
    case '7d': d.setUTCDate(d.getUTCDate() - 7); break;
    case '30d': d.setUTCDate(d.getUTCDate() - 30); break;
    case '3mo': d.setUTCMonth(d.getUTCMonth() - 3); break;
    case '1yr': d.setUTCFullYear(d.getUTCFullYear() - 1); break;
  }
  return d.toISOString();
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateOnly = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/**
 * Week-in-review window: the most-recently-COMPLETED Monday–Sunday before asOf.
 * Auto-emailed each Monday covering the prior Mon–Sun. Returns date-only ISO.
 */
export function weekInReviewWindow(asOfISO: string): { startISO: string; endISO: string } {
  const d = new Date(asOfISO);
  const dow = d.getUTCDay(); // 0 Sun..6 Sat
  // Monday of the current week (treat Sunday as end of the previous week).
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday, 12));
  const start = new Date(thisMonday); start.setUTCDate(start.getUTCDate() - 7); // prior Monday
  const end = new Date(thisMonday); end.setUTCDate(end.getUTCDate() - 1);       // prior Sunday
  return { startISO: dateOnly(start), endISO: dateOnly(end) };
}

/** Month-in-review window: the prior calendar month. */
export function monthInReviewWindow(asOfISO: string): { startISO: string; endISO: string } {
  const d = new Date(asOfISO);
  const firstThis = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  const start = new Date(firstThis); start.setUTCMonth(start.getUTCMonth() - 1);
  const end = new Date(firstThis); end.setUTCDate(0); // last day of prior month
  return { startISO: dateOnly(start), endISO: dateOnly(end) };
}

// --- deferred revenue -------------------------------------------------------

export interface RecognitionMonth { month: string; amountCents: number }

/**
 * Straight-line deferred-revenue recognition across the delivery period. E.g.
 * Academy tuition collected in Sept is EARNED evenly Sept–June, not at payment.
 * Splits total across each calendar month the [start,end] window touches.
 */
export function recognizeDeferredRevenue(totalCents: number, startISO: string, endISO: string): RecognitionMonth[] {
  const months: string[] = [];
  const s = new Date(`${startISO.slice(0, 7)}-01T12:00:00Z`);
  const e = new Date(`${endISO.slice(0, 7)}-01T12:00:00Z`);
  for (let cur = new Date(s); cur <= e; cur.setUTCMonth(cur.getUTCMonth() + 1)) {
    months.push(`${cur.getUTCFullYear()}-${pad2(cur.getUTCMonth() + 1)}`);
  }
  if (months.length === 0) return [];
  const amounts = splitEvenly(totalCents, months.length);
  return months.map((month, i) => ({ month, amountCents: amounts[i] }));
}

/** Revenue earned as of a date = sum of recognition months on/before asOf's month. */
export function revenueEarnedToDate(schedule: RecognitionMonth[], asOfISO: string): number {
  const asOfMonth = asOfISO.slice(0, 7);
  return schedule.filter((m) => m.month <= asOfMonth).reduce((a, m) => a + m.amountCents, 0);
}

// --- margin (itemized) ------------------------------------------------------

export interface ExpenseLine { category: string; amountCents: number }
export interface MarginResult {
  revenueCents: number;
  staffCostCents: number;
  expensesByCategory: ExpenseLine[];
  expenseTotalCents: number;
  marginCents: number;
  marginPct: number;
}

/**
 * Margin = revenue − staff cost (tracked here, Module 5) − QBO expenses. QBO
 * expense categories in excludeCategories are dropped to AVOID DOUBLE-COUNTING
 * staff wages that are already captured as staff cost. Fully itemized.
 */
export function marginBreakdown(input: {
  revenueCents: number;
  staffCostCents: number;
  qboExpenses: ExpenseLine[];
  excludeCategories?: string[];
}): MarginResult {
  const exclude = new Set((input.excludeCategories ?? []).map((c) => c.toLowerCase()));
  const kept = input.qboExpenses.filter((e) => !exclude.has(e.category.toLowerCase()));
  const expenseTotal = kept.reduce((a, e) => a + e.amountCents, 0);
  const margin = input.revenueCents - input.staffCostCents - expenseTotal;
  return {
    revenueCents: input.revenueCents,
    staffCostCents: input.staffCostCents,
    expensesByCategory: kept,
    expenseTotalCents: expenseTotal,
    marginCents: margin,
    marginPct: input.revenueCents ? margin / input.revenueCents : 0,
  };
}

// --- aging ------------------------------------------------------------------

export interface AgingBuckets { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number }

/** Bucket outstanding balances by days overdue relative to asOf. */
export function agingBuckets(invoices: Array<{ dueDate: string; balanceCents: number }>, asOfISO: string): AgingBuckets {
  const asOf = new Date(`${asOfISO.slice(0, 10)}T12:00:00Z`).getTime();
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const inv of invoices) {
    if (inv.balanceCents <= 0) continue;
    const days = Math.floor((asOf - new Date(`${inv.dueDate.slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000);
    if (days <= 0) b.current += inv.balanceCents;
    else if (days <= 30) b.d1_30 += inv.balanceCents;
    else if (days <= 60) b.d31_60 += inv.balanceCents;
    else if (days <= 90) b.d61_90 += inv.balanceCents;
    else b.d90plus += inv.balanceCents;
  }
  return b;
}

// --- conversion / abandoned -------------------------------------------------

export function conversionMetrics(input: { started: number; completed: number }): { conversionRate: number; abandoned: number; abandonRate: number } {
  const abandoned = Math.max(0, input.started - input.completed);
  return {
    conversionRate: input.started ? input.completed / input.started : 0,
    abandoned,
    abandonRate: input.started ? abandoned / input.started : 0,
  };
}

/** Season-over-season retention: returning / prior-season count (0..1).
 * (Named distinctly from programs-core.retentionRate to avoid a barrel clash.) */
export function seasonRetentionRate(priorIds: number[], currentIds: number[]): number {
  if (priorIds.length === 0) return 0;
  const now = new Set(currentIds);
  return priorIds.filter((id) => now.has(id)).length / priorIds.length;
}

// --- capacity nudges --------------------------------------------------------

export type CapacityLevel = 'ok' | 'approaching' | 'full' | 'waitlist_forming';

/** Threshold nudge for a program: 80% -> approaching, full -> full, any waitlist -> waitlist_forming. */
export function capacityLevel(input: { active: number; capacity: number | null; waitlisted: number; thresholdPct?: number }): CapacityLevel {
  if (input.waitlisted > 0) return 'waitlist_forming';
  if (input.capacity == null) return 'ok';
  if (input.active >= input.capacity) return 'full';
  if (input.active / input.capacity >= (input.thresholdPct ?? 80) / 100) return 'approaching';
  return 'ok';
}

// --- facility utilization ---------------------------------------------------

/** Utilization % = booked hours / available hours (0..1). */
export function utilizationPct(bookedHours: number, availableHours: number): number {
  return availableHours > 0 ? Math.min(1, bookedHours / availableHours) : 0;
}

/** Revenue per court-hour in cents. */
export function revenuePerCourtHour(revenueCents: number, courtHours: number): number {
  return courtHours > 0 ? Math.round(revenueCents / courtHours) : 0;
}
