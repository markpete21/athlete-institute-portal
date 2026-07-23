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

export interface FacilityHours extends FacilityNode {
  hours_open?: string | null;   // 'HH:MM' or 'HH:MM:SS'
  hours_close?: string | null;
}

/** Effective hours: node override, else nearest ancestor override, else default. */
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

export interface HoursWarning {
  message: string;
  open: string;
  close: string;
}

/**
 * Warn when a booking falls outside the facility's operating hours (also
 * catches bookings crossing midnight — end time-of-day earlier than start).
 * Advisory: the operator may override (spec: "warned/blocked but overridable").
 */
export function checkOperatingHours(
  tree: FacilityHours[],
  candidate: { facility_id: number; starts_at: string; ends_at: string },
): HoursWarning | null {
  const { open, close } = effectiveHours(tree, candidate.facility_id);
  const start = torontoTimeOfDay(candidate.starts_at);
  const end = torontoTimeOfDay(candidate.ends_at);
  const crossesMidnight = end <= start;
  if (start < open || end > close || crossesMidnight) {
    return {
      message: `Outside operating hours (${open}–${close}): booking runs ${start}–${end}.`,
      open,
      close,
    };
  }
  return null;
}
