/**
 * Pure math behind the booking wizard's live preview — occurrences, line and
 * add-on totals, the payment-schedule defaults, and draft validation. Client
 * safe (no server imports) and unit-tested, so the preview a staff member
 * sees is the same arithmetic the server bills (`lib/rentals/quotes.ts`).
 */
import { addBusinessDays, torontoToday } from './dates';
import { withHst } from './tax';

export interface WizardFacility {
  id: number;
  name: string;
  depth: number;
  hourlyCents: number | null;
  fullDayCents: number | null;
}

export interface WizardAddon {
  id: number;
  name: string;
  pricingMode: 'flat' | 'per_unit' | 'per_hour';
  priceCents: number;
}

export interface LineDraft {
  facilityId: number;
  date: string;
  start: string;
  end: string;
  rateMode: 'hourly' | 'full_day';
  /** Dollars as typed; '' = use the facility's card rate. */
  rateOverride: string;
  repeatMode: 'none' | 'weekly' | 'dates';
  /** weekly: last date (inclusive). */
  repeatUntil: string;
  /** dates: extra specific dates. */
  repeatDates: string[];
  /** Add-ons for THIS block: addonId -> qty (applied to every occurrence). */
  addons: Record<number, number>;
}

export interface BlockDraft {
  facilityId: number;
  date: string;
  start: string;
  end: string;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM_RE = /^\d{2}:\d{2}$/;

export const NO_REPEAT = { repeatMode: 'none' as const, repeatUntil: '', repeatDates: [] as string[], addons: {} as Record<number, number> };

export function emptyLine(facilityId: number, date: string, start = '18:00', end = '19:00'): LineDraft {
  return { facilityId, date, start, end, rateMode: 'hourly', rateOverride: '', ...NO_REPEAT };
}

/** How many bookings a line will create (weekly = same weekday, inclusive). */
export function lineOccurrences(l: Pick<LineDraft, 'date' | 'repeatMode' | 'repeatUntil' | 'repeatDates'>): number {
  if (l.repeatMode === 'weekly' && DATE_RE.test(l.repeatUntil) && l.repeatUntil > l.date) {
    const days = (Date.parse(`${l.repeatUntil}T12:00:00Z`) - Date.parse(`${l.date}T12:00:00Z`)) / 86400_000;
    return Math.floor(days / 7) + 1;
  }
  if (l.repeatMode === 'dates') return 1 + l.repeatDates.length;
  return 1;
}

export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

/** Rate in cents for a line: typed override, else the facility card rate for the mode. */
export function lineRateCents(l: LineDraft, facility: WizardFacility | undefined): number | null {
  if (l.rateOverride !== '') {
    const v = Math.round(Number(l.rateOverride) * 100);
    return Number.isFinite(v) ? v : null;
  }
  return l.rateMode === 'hourly' ? facility?.hourlyCents ?? null : facility?.fullDayCents ?? null;
}

/** One occurrence's facility charge (hourly × hours, or the full-day rate). */
export function lineTotalCents(l: LineDraft, facility: WizardFacility | undefined): number | null {
  const rate = lineRateCents(l, facility);
  if (rate == null) return null;
  return l.rateMode === 'hourly' ? Math.round(rate * hoursBetween(l.start, l.end)) : rate;
}

/** Mirror of the server's addonTotalCents for one add-on at one quantity. */
export function addonCents(a: WizardAddon, qty: number, blockHours: number | null): number {
  if (qty <= 0) return 0;
  if (a.pricingMode === 'flat') return a.priceCents;
  if (a.pricingMode === 'per_unit') return a.priceCents * qty;
  return Math.round(a.priceCents * (blockHours ?? qty));
}

/** Add-ons attached to a block, per occurrence. */
export function lineAddonTotalCents(l: LineDraft, addons: WizardAddon[]): number {
  return addons.reduce((sum, a) => sum + addonCents(a, l.addons[a.id] ?? 0, hoursBetween(l.start, l.end)), 0);
}

/** Rental-wide add-ons (not attached to a block). */
export function globalAddonTotalCents(addonQty: Record<number, number>, addons: WizardAddon[]): number {
  return addons.reduce((sum, a) => sum + addonCents(a, addonQty[a.id] ?? 0, null), 0);
}

export interface QuoteTotals {
  feesCents: number;
  totalWithTaxCents: number;
  depositCents: number;
  missingRates: boolean;
}

/** The whole preview in one call: fees across every occurrence + add-ons, HST, deposit. */
export function quoteTotals(input: {
  kind: 'internal' | 'rental';
  lines: LineDraft[];
  facilities: Map<number, WizardFacility>;
  addons: WizardAddon[];
  addonQty: Record<number, number>;
  depositPct: number;
}): QuoteTotals {
  if (input.kind !== 'rental') return { feesCents: 0, totalWithTaxCents: 0, depositCents: 0, missingRates: false };
  const feesCents = input.lines.reduce((sum, l) => {
    const f = input.facilities.get(l.facilityId);
    return sum + ((lineTotalCents(l, f) ?? 0) + lineAddonTotalCents(l, input.addons)) * lineOccurrences(l);
  }, 0) + globalAddonTotalCents(input.addonQty, input.addons);
  const totalWithTaxCents = withHst(feesCents).totalCents;
  const pct = Number.isFinite(input.depositPct) && input.depositPct > 0 ? input.depositPct : 25;
  return {
    feesCents,
    totalWithTaxCents,
    depositCents: Math.round((totalWithTaxCents * pct) / 100),
    missingRates: input.lines.some((l) => lineRateCents(l, input.facilities.get(l.facilityId)) == null),
  };
}

export function lineValid(l: LineDraft): boolean {
  return !!l.facilityId && DATE_RE.test(l.date) && HHMM_RE.test(l.start) && HHMM_RE.test(l.end) && l.end > l.start
    && (l.repeatMode !== 'weekly' || (DATE_RE.test(l.repeatUntil) && l.repeatUntil > l.date))
    && (l.repeatMode !== 'dates' || l.repeatDates.length > 0);
}

export function blockValid(b: BlockDraft): boolean {
  return !!b.facilityId && DATE_RE.test(b.date) && HHMM_RE.test(b.start) && HHMM_RE.test(b.end) && b.end > b.start;
}

/** Deposit default: 5 business days from today (Toronto). */
export function defaultDepositDue(today = torontoToday()): string {
  return addBusinessDays(today, 5);
}

/**
 * Balance default: 10 business days before the first booking (never in the
 * past); with no facility attached yet, 20 business days out as a placeholder.
 */
export function defaultBalanceDue(earliestDate: string | null, today = torontoToday()): string {
  if (!earliestDate) return addBusinessDays(today, 20);
  const d = addBusinessDays(earliestDate, -10);
  return d < today ? today : d;
}
