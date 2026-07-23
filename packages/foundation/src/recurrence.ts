/**
 * Recurrence engine (Module 2 Stage 4) - PURE, edge-safe. Programs (Module 4)
 * call this through lib/bookings' createRecurringBookings; each generated
 * occurrence is its OWN booking row (series_id ties them together), which is
 * what makes single-instance conflict resolution natural: resolving one date
 * touches one row, the series stays intact.
 *
 * DST-correct: occurrences are defined by TORONTO WALL TIME ("every Tuesday
 * 6-8pm"), so a series crossing a clock change keeps its local time - the
 * UTC instants shift instead.
 */

import { TIMEZONE } from './dates';

export interface WeeklyPattern {
  freq: 'weekly';
  /** 0=Sunday ... 6=Saturday (Toronto local). */
  byWeekday: number[];
  /** Every N weeks (default 1). */
  interval?: number;
}

export interface RecurrenceInput {
  pattern: WeeklyPattern;
  /** First date to consider (ISO date, Toronto local), inclusive. */
  startDate: string;   // YYYY-MM-DD
  /** Wall-clock times, Toronto local. */
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
  /** Stop condition: until date (inclusive) OR occurrence count. */
  until?: string;      // YYYY-MM-DD
  count?: number;
  /** Safety valve. */
  maxOccurrences?: number;
}

export interface Occurrence {
  date: string;      // YYYY-MM-DD (Toronto)
  starts_at: string; // ISO instant
  ends_at: string;   // ISO instant
}

/** The UTC offset (minutes) TIMEZONE has at a given instant. */
function offsetMinutesAt(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return (asUtc - utcMs) / 60_000;
}

/** Toronto wall time -> ISO instant (DST-resolved). */
export function torontoInstant(dateISO: string, timeHHMM: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = timeHHMM.split(':').map(Number);
  // First guess: treat wall time as UTC, then correct by the real offset -
  // recompute once because the offset itself can change at the boundary.
  let utc = Date.UTC(y, m - 1, d, hh, mm, 0);
  utc -= offsetMinutesAt(utc) * 60_000;
  utc = Date.UTC(y, m - 1, d, hh, mm, 0) - offsetMinutesAt(utc) * 60_000;
  return new Date(utc).toISOString();
}

/** Weekday (0-6, Sunday-first) of a calendar date - pure calendar math. */
function weekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Expand a weekly pattern into concrete occurrences. */
export function expandRecurrence(input: RecurrenceInput): Occurrence[] {
  const { pattern } = input;
  if (pattern.freq !== 'weekly') throw new Error(`Unsupported freq: ${(pattern as { freq: string }).freq}`);
  if (!pattern.byWeekday?.length) throw new Error('byWeekday required');
  if (!input.until && !input.count) throw new Error('Provide until or count');
  if (input.endTime <= input.startTime) throw new Error('endTime must be after startTime (same-day bookings)');

  const interval = Math.max(1, pattern.interval ?? 1);
  const max = input.maxOccurrences ?? 200;
  const wanted = new Set(pattern.byWeekday);

  // Anchor week: the week (Sunday-start) containing startDate.
  const anchorSunday = addDays(input.startDate, -weekdayOf(input.startDate));

  const out: Occurrence[] = [];
  let date = input.startDate;
  while (out.length < max) {
    if (input.until && date > input.until) break;
    if (wanted.has(weekdayOf(date))) {
      // Interval check: whole weeks elapsed since the anchor week.
      const weeksFromAnchor = Math.floor(
        (Date.parse(date + 'T00:00:00Z') - Date.parse(anchorSunday + 'T00:00:00Z')) / (7 * 86400_000),
      );
      if (weeksFromAnchor % interval === 0) {
        out.push({
          date,
          starts_at: torontoInstant(date, input.startTime),
          ends_at: torontoInstant(date, input.endTime),
        });
        if (input.count && out.length >= input.count) break;
      }
    }
    date = addDays(date, 1);
  }
  return out;
}
