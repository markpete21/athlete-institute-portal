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
  /** Hover-card fields. */
  timeLabel: string;
  facilityName: string;
  isInternal: boolean;
  setupMinutes: number;
  cleanupMinutes: number;
}

export interface GanttViewRow {
  facilityId: number;
  /** Column 2 (child facility). */
  child: string;
  bars: GanttBar[];
}

/**
 * One column-1 facility (Dome, Fieldhouse, a childless location) with its
 * child rows. Bookings placed directly on the parent land in `wholeBars` and
 * render as ONE block spanning every child row - there is no separate
 * "(whole)" line. A childless parent renders wholeBars as its only row.
 */
export interface GanttGroup {
  parentId: number;
  parent: string;
  wholeBars: GanttBar[];
  rows: GanttViewRow[];
}

const frac = (iso: string, dayStartMs: number, dayEndMs: number) =>
  Math.min(1, Math.max(0, (Date.parse(iso) - dayStartMs) / (dayEndMs - dayStartMs)));

const fmtBarTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });

/**
 * The parent/child resource view. `parents` are the column-1 facilities
 * (e.g. Dome, Fieldhouse); each of their children gets a row, with bookings
 * on that child OR ANY OF ITS DESCENDANTS rolled up onto the row. Bookings
 * placed directly on the parent become group-level `wholeBars` (they occupy
 * every child).
 */
export function ganttForDay(
  tree: FacilityNode[],
  bookings: BookingRecord[],
  dateISO: string,
  parentIds: number[],
  conflictedIds: Set<number>,
): GanttGroup[] {
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
    timeLabel: `${fmtBarTime(b.starts_at)} – ${fmtBarTime(b.ends_at)}`,
    facilityName: byId.get(b.facility_id)?.name ?? `facility ${b.facility_id}`,
    isInternal: b.is_internal,
    setupMinutes: b.setup_minutes ?? 0,
    cleanupMinutes: b.cleanup_minutes ?? 0,
  });

  const groups: GanttGroup[] = [];
  for (const pid of parentIds) {
    const parent = byId.get(pid);
    if (!parent) continue;
    const children = tree
      .filter((n) => n.parent_id === pid)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const wholeBars = inDay.filter((b) => b.facility_id === pid).map(toBar);
    const rows: GanttViewRow[] = children.map((child) => {
      const scope = new Set([child.id, ...descendantIds(tree, child.id)]);
      return {
        facilityId: child.id,
        child: child.name,
        bars: inDay.filter((b) => scope.has(b.facility_id)).map(toBar),
      };
    });
    groups.push({ parentId: pid, parent: parent.name, wholeBars, rows });
  }
  return groups;
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
