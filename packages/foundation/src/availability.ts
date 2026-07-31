/**
 * Tree-aware availability engine (Module 2 Stage 2) - PURE, edge-safe.
 * THE highest-risk logic in the platform (master doc); every booking runs
 * through it via lib/bookings.ts.
 *
 * Occupancy rules (spec):
 *   - A booking occupies its node AND all descendants for its interval.
 *   - A booking on a child makes every ancestor unavailable AS A WHOLE
 *     (siblings stay independently bookable). Two booked half-court baskets
 *     therefore occupy the court - and the court's ancestors - while each
 *     basket remains its own record.
 *   - One booking per node per slot; sharing = separate child nodes.
 *   - Buffers (setup before / cleanup after) extend the OCCUPIED interval.
 *   - Tentative quotes hold slots exactly like confirmed bookings.
 *   - Intervals are half-open [start, end): back-to-back is NOT a conflict.
 *
 * Conflicts are ADVISORY: callers surface them for operator resolution
 * (Stage 3); nothing here blocks inserts.
 */

import { ancestorIds, descendantIds, type FacilityNode } from './facility-tree';
import { TIMEZONE } from './dates';

export interface BookingInterval {
  id: number;
  facility_id: number;
  /** ISO timestamps. */
  starts_at: string;
  ends_at: string;
  setup_minutes?: number;
  cleanup_minutes?: number;
  status?: 'tentative' | 'confirmed';
  title?: string;
}

export interface CandidateSlot {
  facility_id: number;
  starts_at: string;
  ends_at: string;
  setup_minutes?: number;
  cleanup_minutes?: number;
  /** Exclude this booking id (editing an existing booking). */
  ignoreBookingId?: number;
}

export type ConflictRelation = 'same-node' | 'ancestor' | 'descendant';

export interface Conflict {
  booking: BookingInterval;
  /** How the colliding booking relates to the candidate's node. */
  relation: ConflictRelation;
}

const MS_PER_MIN = 60_000;

/** A booking's OCCUPIED window (buffers applied), in epoch ms. */
export function occupiedInterval(b: {
  starts_at: string; ends_at: string; setup_minutes?: number; cleanup_minutes?: number;
}): { startMs: number; endMs: number } {
  return {
    startMs: Date.parse(b.starts_at) - (b.setup_minutes ?? 0) * MS_PER_MIN,
    endMs: Date.parse(b.ends_at) + (b.cleanup_minutes ?? 0) * MS_PER_MIN,
  };
}

/** Half-open interval overlap. */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * All conflicts for a candidate slot: overlapping bookings on the node itself,
 * on any ancestor, or on any descendant. Sibling bookings never appear.
 */
export function findConflicts(
  tree: FacilityNode[],
  bookings: BookingInterval[],
  candidate: CandidateSlot,
): Conflict[] {
  const cand = occupiedInterval(candidate);
  const ancestors = new Set(ancestorIds(tree, candidate.facility_id));
  const descendants = new Set(descendantIds(tree, candidate.facility_id));

  const conflicts: Conflict[] = [];
  for (const b of bookings) {
    if (b.id === candidate.ignoreBookingId) continue;
    let relation: ConflictRelation | null = null;
    if (b.facility_id === candidate.facility_id) relation = 'same-node';
    else if (ancestors.has(b.facility_id)) relation = 'ancestor';
    else if (descendants.has(b.facility_id)) relation = 'descendant';
    if (!relation) continue;

    const other = occupiedInterval(b);
    if (intervalsOverlap(cand.startMs, cand.endMs, other.startMs, other.endMs)) {
      conflicts.push({ booking: b, relation });
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Operating hours (Toronto local; warn-not-block, overridable per booking)
// ---------------------------------------------------------------------------

export const DEFAULT_HOURS_OPEN = '08:00';
export const DEFAULT_HOURS_CLOSE = '23:00';

/** One weekday's operating window. weekday: 0 = Sunday .. 6 = Saturday. */
export interface HoursWindow {
  weekday: number;
  open: string;   // 'HH:MM'
  close: string;  // 'HH:MM'
}

export interface FacilityHours extends FacilityNode {
  hours_open?: string | null;   // 'HH:MM' or 'HH:MM:SS' (legacy single window)
  hours_close?: string | null;
  /** Weekday windows; supersedes hours_open/close. Closed on unlisted days. */
  hours_windows?: HoursWindow[] | null;
}

/** Resolved hours for a specific day: a window, or explicitly closed. */
export type DayHours =
  | { closed: false; open: string; close: string }
  | { closed: true; open: null; close: null };

const CLOSED: DayHours = { closed: true, open: null, close: null };

/**
 * Effective hours for one weekday: the nearest node up the chain that defines
 * ANY hours wins outright — a node's own schedule is never merged with an
 * ancestor's. A node that lists windows is CLOSED on the weekdays it omits
 * (that is how "OCS runs weeknights only" is expressed); a node using the
 * legacy single window applies it every day.
 */
export function effectiveHoursOn(
  tree: FacilityHours[],
  facilityId: number,
  weekday: number,
): DayHours {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const chain = [facilityId, ...ancestorIds(tree, facilityId)];
  for (const id of chain) {
    const n = byId.get(id);
    if (!n) continue;
    const windows = n.hours_windows;
    if (Array.isArray(windows) && windows.length > 0) {
      const w = windows.find((x) => Number(x.weekday) === weekday);
      return w
        ? { closed: false, open: w.open.slice(0, 5), close: w.close.slice(0, 5) }
        : CLOSED;
    }
    if (n.hours_open && n.hours_close) {
      return { closed: false, open: n.hours_open.slice(0, 5), close: n.hours_close.slice(0, 5) };
    }
  }
  return { closed: false, open: DEFAULT_HOURS_OPEN, close: DEFAULT_HOURS_CLOSE };
}

/**
 * Day-agnostic hours (legacy single-window callers). Weekday-aware callers
 * should use effectiveHoursOn.
 */
export function effectiveHours(
  tree: FacilityHours[],
  facilityId: number,
): { open: string; close: string } {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const chain = [facilityId, ...ancestorIds(tree, facilityId)];
  for (const id of chain) {
    const n = byId.get(id);
    if (n?.hours_open && n?.hours_close) {
      return { open: n.hours_open.slice(0, 5), close: n.hours_close.slice(0, 5) };
    }
  }
  return { open: DEFAULT_HOURS_OPEN, close: DEFAULT_HOURS_CLOSE };
}

/** 'HH:MM' in Toronto for an ISO instant. */
export function torontoTimeOfDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Weekday (0 = Sunday) in Toronto for an ISO instant. */
export function torontoWeekday(iso: string): number {
  const name = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, weekday: 'long' }).format(new Date(iso));
  const i = WEEKDAY_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unrecognised weekday "${name}"`);
  return i;
}

/** Toronto local calendar date 'YYYY-MM-DD' for an ISO instant. */
export function torontoDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

export interface HoursWarning {
  message: string;
  /** Null when the facility is closed that whole day. */
  open: string | null;
  close: string | null;
}

/**
 * Warn when a booking falls outside the facility's operating hours for THAT
 * weekday (also catches bookings crossing midnight — end time-of-day earlier
 * than start). Advisory only: Athlete Institute runs events that legitimately
 * start early or run late, so the operator is warned and proceeds.
 */
export function checkOperatingHours(
  tree: FacilityHours[],
  candidate: { facility_id: number; starts_at: string; ends_at: string },
): HoursWarning | null {
  const weekday = torontoWeekday(candidate.starts_at);
  const hours = effectiveHoursOn(tree, candidate.facility_id, weekday);
  const start = torontoTimeOfDay(candidate.starts_at);
  const end = torontoTimeOfDay(candidate.ends_at);

  if (hours.closed) {
    return {
      message: `Closed on ${WEEKDAY_NAMES[weekday]}s: booking runs ${start}-${end}.`,
      open: null,
      close: null,
    };
  }

  const { open, close } = hours;
  const crossesMidnight = end <= start;
  if (start < open || end > close || crossesMidnight) {
    return {
      message: `Outside operating hours (${open}-${close}) on ${WEEKDAY_NAMES[weekday]}: booking runs ${start}-${end}.`,
      open,
      close,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seasonal / holiday closures (outdoor facilities in winter, shutdown weeks)
// ---------------------------------------------------------------------------

export interface FacilityClosure {
  id: number;
  facility_id: number;
  /** Inclusive Toronto local dates, 'YYYY-MM-DD'. */
  starts_on: string;
  ends_on: string;
  reason?: string | null;
}

export interface ClosureWarning {
  message: string;
  closure: FacilityClosure;
  /** True when the closure sits on an ancestor rather than the booked node. */
  inherited: boolean;
}

/**
 * Warn when a booking lands inside a closure on its own node or any ancestor
 * (closing "Dome" closes its courts and baskets). Advisory, like hours —
 * staff may still book a closed facility deliberately.
 */
export function checkClosures(
  tree: FacilityNode[],
  closures: FacilityClosure[],
  candidate: { facility_id: number; starts_at: string; ends_at: string },
): ClosureWarning[] {
  if (closures.length === 0) return [];
  const scope = new Set([candidate.facility_id, ...ancestorIds(tree, candidate.facility_id)]);
  const startDate = torontoDate(candidate.starts_at);
  const endDate = torontoDate(candidate.ends_at);

  return closures
    .filter((c) => scope.has(c.facility_id))
    // Inclusive range overlap against the booking's local date span.
    .filter((c) => c.starts_on <= endDate && c.ends_on >= startDate)
    .map((c) => ({
      closure: c,
      inherited: c.facility_id !== candidate.facility_id,
      message: `Facility closed ${c.starts_on} to ${c.ends_on}${c.reason ? ` (${c.reason})` : ''}.`,
    }));
}
