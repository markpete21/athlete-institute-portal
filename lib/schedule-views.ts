import {
  ancestorIds,
  descendantIds,
  torontoInstant,
  type FacilityNode,
} from '@ai/foundation';
import type { BookingRecord } from '@/lib/bookings';

/**
 * Schedule view shaping (Module 2 Stage 5) - pure functions turning the
 * facility tree + a window of bookings into render models for the admin
 * Day-Gantt / Week / Month views. Kept UI-free so the verify route can prove
 * the math (fractions, parent/child row mapping, rollups, filters).
 */

/** The visible day axis (Toronto wall clock). */
export const DAY_AXIS = { startHour: 7, endHour: 23 };

export interface GanttBar {
  bookingId: number;
  title: string;
  /** 0..1 fractions across the day axis (clamped). */
  start: number;
  end: number;
  source: BookingRecord['source'];
  status: BookingRecord['status'];
  conflicted: boolean;
}

export interface GanttViewRow {
  facilityId: number;
  /** Column 1 (parent facility) - blank for repeat rows under the same parent. */
  parent: string;
  /** Column 2 (child) - or "(whole)" for bookings directly on the parent. */
  child: string;
  bars: GanttBar[];
}

const frac = (iso: string, dayStartMs: number, dayEndMs: number) =>
  Math.min(1, Math.max(0, (Date.parse(iso) - dayStartMs) / (dayEndMs - dayStartMs)));

/**
 * The parent/child resource view. `parents` are the column-1 facilities
 * (e.g. Dome, Fieldhouse); each of their children gets a row, with bookings
 * on that child OR ANY OF ITS DESCENDANTS rolled up onto the row. Bookings
 * placed directly on the parent get a "(whole)" row above the children.
 */
export function ganttForDay(
  tree: FacilityNode[],
  bookings: BookingRecord[],
  dateISO: string,
  parentIds: number[],
  conflictedIds: Set<number>,
): GanttViewRow[] {
  const dayStartMs = Date.parse(torontoInstant(dateISO, `${String(DAY_AXIS.startHour).padStart(2, '0')}:00`));
  const dayEndMs = Date.parse(torontoInstant(dateISO, `${String(DAY_AXIS.endHour).padStart(2, '0')}:00`));
  const byId = new Map(tree.map((n) => [n.id, n]));

  const inDay = bookings.filter(
    (b) => Date.parse(b.starts_at) < dayEndMs && Date.parse(b.ends_at) > dayStartMs,
  );

  const toBar = (b: BookingRecord): GanttBar => ({
    bookingId: b.id,
    title: b.title,
    start: frac(b.starts_at, dayStartMs, dayEndMs),
    end: frac(b.ends_at, dayStartMs, dayEndMs),
    source: b.source,
    status: b.status,
    conflicted: conflictedIds.has(b.id),
  });

  const rows: GanttViewRow[] = [];
  for (const pid of parentIds) {
    const parent = byId.get(pid);
    if (!parent) continue;
    const children = tree
      .filter((n) => n.parent_id === pid)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    // Bookings directly on the parent occupy it "as a whole".
    const wholeBars = inDay.filter((b) => b.facility_id === pid).map(toBar);
    if (wholeBars.length) {
      rows.push({ facilityId: pid, parent: parent.name, child: '(whole)', bars: wholeBars });
    }

    children.forEach((child, idx) => {
      const scope = new Set([child.id, ...descendantIds(tree, child.id)]);
      const bars = inDay.filter((b) => scope.has(b.facility_id)).map(toBar);
      rows.push({
        facilityId: child.id,
        parent: idx === 0 && !wholeBars.length ? parent.name : idx === 0 ? '' : '',
        child: child.name,
        bars,
      });
    });
    // First child row carries the parent label when no (whole) row shown.
    const firstIdx = rows.findIndex((r) => r.parent === '' && byId.get(r.facilityId)?.parent_id === pid);
    if (!wholeBars.length && firstIdx >= 0) rows[firstIdx].parent = parent.name;
  }
  return rows;
}

/** Toronto calendar date (YYYY-MM-DD) of an instant. */
export function torontoDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

/** Bookings grouped by Toronto date - the month view model. */
export function bookingsByDate(bookings: BookingRecord[]): Map<string, BookingRecord[]> {
  const map = new Map<string, BookingRecord[]>();
  for (const b of bookings) {
    const d = torontoDateOf(b.starts_at);
    map.set(d, [...(map.get(d) ?? []), b]);
  }
  return map;
}

export interface ScheduleFilters {
  facilityIds?: number[];  // selected nodes - bookings in their subtrees (or on ancestors)
  source?: BookingRecord['source'];
  status?: BookingRecord['status'];
  internal?: 'internal' | 'external';
}

/**
 * Apply the filter bar. Facility filtering is tree-aware: a booking matches a
 * selected node if it sits on the node, inside its subtree, or on an ancestor
 * (an ancestor booking occupies the selected node too).
 */
export function filterBookings(
  tree: FacilityNode[],
  bookings: BookingRecord[],
  f: ScheduleFilters,
): BookingRecord[] {
  let scope: Set<number> | null = null;
  if (f.facilityIds?.length) {
    scope = new Set<number>();
    for (const id of f.facilityIds) {
      scope.add(id);
      for (const d of descendantIds(tree, id)) scope.add(d);
      for (const a of ancestorIds(tree, id)) scope.add(a);
    }
  }
  return bookings.filter((b) => {
    if (scope && !scope.has(b.facility_id)) return false;
    if (f.source && b.source !== f.source) return false;
    if (f.status && b.status !== f.status) return false;
    if (f.internal === 'internal' && !b.is_internal) return false;
    if (f.internal === 'external' && b.is_internal) return false;
    return true;
  });
}
