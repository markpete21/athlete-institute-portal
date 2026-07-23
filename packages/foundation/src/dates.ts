/**
 * Dates (Module 0 §9) — seasons, business-day math, America/Toronto. PURE +
 * edge-safe.
 *
 * Two things trip up a Canadian facility app: the fixed three seasons (staff
 * credit tops up per season) and "10 / 5 business days" windows (refunds). Both
 * live here so no module re-derives them. Date-only values are ISO YYYY-MM-DD
 * strings to sidestep timezone/DST drift; "today" is resolved in Toronto.
 */

export const TIMEZONE = 'America/Toronto';

// --- seasons ----------------------------------------------------------------

export type SeasonKey = 'jan-apr' | 'may-aug' | 'sep-dec';

export interface Season {
  key: SeasonKey;
  label: string;
  year: number;
  /** Inclusive bounds, ISO date-only. */
  startISO: string;
  endISO: string;
}

const SEASON_DEFS: Array<{ key: SeasonKey; label: string; startMonth: number; endMonth: number; endDay: number }> = [
  { key: 'jan-apr', label: 'January–April', startMonth: 1, endMonth: 4, endDay: 30 },
  { key: 'may-aug', label: 'May–August', startMonth: 5, endMonth: 8, endDay: 31 },
  { key: 'sep-dec', label: 'September–December', startMonth: 9, endMonth: 12, endDay: 31 },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** The fixed season containing a given date (defaults to today in Toronto). */
export function seasonForDate(dateISO?: string): Season {
  const iso = dateISO ?? torontoToday();
  const [year, month] = iso.split('-').map(Number);
  const def = SEASON_DEFS.find((d) => month >= d.startMonth && month <= d.endMonth)!;
  return {
    key: def.key,
    label: def.label,
    year,
    startISO: `${year}-${pad(def.startMonth)}-01`,
    endISO: `${year}-${pad(def.endMonth)}-${pad(def.endDay)}`,
  };
}

export function currentSeason(): Season {
  return seasonForDate();
}

// --- Toronto "today" --------------------------------------------------------

/** Today's date (ISO YYYY-MM-DD) in America/Toronto, DST-correct. */
export function torontoToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; the timeZone option handles EST/EDT.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// --- business-day math ------------------------------------------------------

/** Parse an ISO date-only string to its UTC-noon Date (avoids DST edges). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function dateToIso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** True for Mon–Fri (weekend = Sat/Sun). Statutory holidays are a later refinement. */
export function isBusinessDay(iso: string): boolean {
  const day = isoToDate(iso).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Add N business days to an ISO date (skips weekends). N=0 returns the same
 * date even if it's a weekend. Used for refund/notice windows ("10 business
 * days", "5 business days").
 */
export function addBusinessDays(iso: string, n: number): string {
  const date = isoToDate(iso);
  let added = 0;
  const step = n >= 0 ? 1 : -1;
  const target = Math.abs(n);
  while (added < target) {
    date.setUTCDate(date.getUTCDate() + step);
    if (isBusinessDay(dateToIso(date))) added++;
  }
  return dateToIso(date);
}

/** Count business days strictly between two ISO dates (exclusive of start, inclusive of end). */
export function businessDaysBetween(startISO: string, endISO: string): number {
  const start = isoToDate(startISO);
  const end = isoToDate(endISO);
  if (end <= start) return 0;
  let count = 0;
  const cur = start;
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (isBusinessDay(dateToIso(cur))) count++;
  }
  return count;
}
