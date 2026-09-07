import 'server-only';
import {
  audit,
  checkClosures,
  checkOperatingHours,
  findConflicts,
  torontoDate,
  type BookingInterval,
  type ClosureWarning,
  type Conflict,
  type FacilityClosure,
  type BookingSource,
  type FacilityHours,
  type FacilityNode,
  type HoursWarning,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * THE BOOKINGS API (Module 2) - the integration contract. Rentals (M3),
 * Programs (M4+), and events create every booking through these functions;
 * no module keeps its own booking store (master doc golden rule #1).
 *
 * Contract summary (see also README):
 *   checkAvailability(slot)          -> { available, conflicts, warnings }
 *   createBooking(input)             -> { booking, conflicts, warnings }
 *       Conflicts DO NOT block creation - they are returned for operator
 *       resolution (Stage 3 UI; quotes hold slots by design).
 *   updateBooking(id, patch)         -> same shape, self-ignoring
 *   cancelBooking(id)                -> soft cancel (engine ignores it)
 *   listBookings(filter)             -> schedule reads (views, displays)
 *
 * Public-schedule default (spec): ON for program/event, OFF for rental/internal
 * unless the caller says otherwise.
 */

export interface BookingRecord extends BookingInterval {
  source: BookingSource;
  status: 'tentative' | 'confirmed';
  is_internal: boolean;
  title: string;
  logo_url: string | null;
  show_on_public_schedule: boolean;
  source_ref: string | null;
  series_id: number | null;
  canceled_at: string | null;
}

export interface CreateBookingInput {
  facilityId: number;
  startsAt: string; // ISO
  endsAt: string;
  source: BookingRecord['source'];
  title: string;
  status?: BookingRecord['status'];       // default 'confirmed' ('tentative' = quote hold)
  isInternal?: boolean;
  logoUrl?: string | null;
  showOnPublicSchedule?: boolean;         // default: source is program/event
  sourceRef?: string | null;
  setupMinutes?: number;
  cleanupMinutes?: number;
  seriesId?: number | null;
  /** Household this booking belongs to (family schedule on play). */
  familyId?: number | null;
  actorClerkId: string;
}

export interface AvailabilityReport {
  available: boolean;
  conflicts: Conflict[];
  /** Operating-hours warnings (advisory - staff may book outside hours). */
  warnings: HoursWarning[];
  /** Seasonal/holiday closure warnings, incl. ones inherited from an ancestor. */
  closures: ClosureWarning[];
}

const COLS =
  'id, facility_id, starts_at, ends_at, source, status, is_internal, title, logo_url, show_on_public_schedule, source_ref, setup_minutes, cleanup_minutes, series_id, canceled_at';

/** Widest buffer we account for when pre-filtering by time in SQL. */
const MAX_BUFFER_MIN = 480;

async function facilityRows(): Promise<FacilityHours[]> {
  const { data, error } = await supabaseAdmin()
    .from('facilities')
    .select('id, parent_id, name, label, sort_order, bookable, deleted_at, hours_open, hours_close, hours_windows, location_id')
    .is('deleted_at', null);
  if (error) throw new Error(`facilities read failed: ${error.message}`);
  return (data ?? []) as FacilityHours[];
}

/** Closures overlapping the window (the tree walk decides which ones apply). */
async function closureRows(startsAt: string, endsAt: string): Promise<FacilityClosure[]> {
  const { data, error } = await supabaseAdmin()
    .from('facility_closures')
    .select('id, facility_id, starts_on, ends_on, reason')
    .lte('starts_on', torontoDate(endsAt))
    .gte('ends_on', torontoDate(startsAt));
  if (error) throw new Error(`closures read failed: ${error.message}`);
  return (data ?? []) as FacilityClosure[];
}

/** Live bookings that could overlap the window (SQL pre-filter, exact math in code). */
async function candidateBookings(startsAt: string, endsAt: string): Promise<BookingRecord[]> {
  const padStart = new Date(Date.parse(startsAt) - MAX_BUFFER_MIN * 60_000).toISOString();
  const padEnd = new Date(Date.parse(endsAt) + MAX_BUFFER_MIN * 60_000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from('bookings')
    .select(COLS)
    .is('canceled_at', null)
    .lt('starts_at', padEnd)
    .gt('ends_at', padStart);
  if (error) throw new Error(`bookings read failed: ${error.message}`);
  return (data ?? []) as BookingRecord[];
}

export async function checkAvailability(slot: {
  facilityId: number;
  startsAt: string;
  endsAt: string;
  setupMinutes?: number;
  cleanupMinutes?: number;
  ignoreBookingId?: number;
}): Promise<AvailabilityReport> {
  const [tree, bookings, closures] = await Promise.all([
    facilityRows(),
    candidateBookings(slot.startsAt, slot.endsAt),
    closureRows(slot.startsAt, slot.endsAt),
  ]);
  const conflicts = findConflicts(tree, bookings, {
    facility_id: slot.facilityId,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
    setup_minutes: slot.setupMinutes,
    cleanup_minutes: slot.cleanupMinutes,
    ignoreBookingId: slot.ignoreBookingId,
  });
  const hoursWarning = checkOperatingHours(tree, {
    facility_id: slot.facilityId,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
  });
  return {
    available: conflicts.length === 0,
    conflicts,
    warnings: hoursWarning ? [hoursWarning] : [],
    closures: checkClosures(tree, closures, {
      facility_id: slot.facilityId,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
    }),
  };
}

/** The one rule for "can a booking point at this facility": it exists, is live, and is bookable. */
export function assertBookable(tree: FacilityNode[], facilityId: number): FacilityNode {
  const node = tree.find((f) => f.id === facilityId);
  if (!node) throw new Error(`Facility ${facilityId} not found (or deleted).`);
  if (!node.bookable) throw new Error(`"${node.name}" is not bookable.`);
  return node;
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<{ booking: BookingRecord } & AvailabilityReport> {
  const tree = await facilityRows();
  assertBookable(tree, input.facilityId);

  const report = await checkAvailability({
    facilityId: input.facilityId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    setupMinutes: input.setupMinutes,
    cleanupMinutes: input.cleanupMinutes,
  });

  const showPublic =
    input.showOnPublicSchedule ?? (input.source === 'program' || input.source === 'event');

  const { data, error } = await supabaseAdmin()
    .from('bookings')
    .insert({
      facility_id: input.facilityId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      source: input.source,
      status: input.status ?? 'confirmed',
      is_internal: input.isInternal ?? input.source === 'internal',
      title: input.title.trim(),
      logo_url: input.logoUrl ?? null,
      show_on_public_schedule: showPublic,
      source_ref: input.sourceRef ?? null,
      setup_minutes: input.setupMinutes ?? 0,
      cleanup_minutes: input.cleanupMinutes ?? 0,
      series_id: input.seriesId ?? null,
      family_id: input.familyId ?? null,
      created_by: input.actorClerkId,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`booking create failed: ${error.message}`);

  await audit({
    actorId: input.actorClerkId,
    action: 'booking.created',
    target: `booking:${data.id}`,
    meta: {
      facility_id: input.facilityId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      source: input.source,
      status: input.status ?? 'confirmed',
      conflicts: report.conflicts.length,
    },
  });

  return { booking: data as BookingRecord, ...report };
}

export async function updateBooking(
  id: number,
  patch: Partial<Pick<CreateBookingInput, 'startsAt' | 'endsAt' | 'title' | 'status' | 'logoUrl' | 'showOnPublicSchedule' | 'setupMinutes' | 'cleanupMinutes'>> & { facilityId?: number },
  actorClerkId: string,
): Promise<{ booking: BookingRecord } & AvailabilityReport> {
  const db = supabaseAdmin();
  const { data: cur, error: e0 } = await db.from('bookings').select(COLS).eq('id', id).maybeSingle();
  if (e0) throw new Error(`booking read failed: ${e0.message}`);
  if (!cur) throw new Error('Booking not found.');
  // Moving a booking is held to the same facility rule as creating one.
  if (patch.facilityId !== undefined && patch.facilityId !== cur.facility_id) assertBookable(await facilityRows(), patch.facilityId);

  const next = {
    facility_id: patch.facilityId ?? cur.facility_id,
    starts_at: patch.startsAt ?? cur.starts_at,
    ends_at: patch.endsAt ?? cur.ends_at,
    setup_minutes: patch.setupMinutes ?? cur.setup_minutes,
    cleanup_minutes: patch.cleanupMinutes ?? cur.cleanup_minutes,
  };
  const report = await checkAvailability({
    facilityId: next.facility_id,
    startsAt: next.starts_at,
    endsAt: next.ends_at,
    setupMinutes: next.setup_minutes,
    cleanupMinutes: next.cleanup_minutes,
    ignoreBookingId: id,
  });

  const { data, error } = await db
    .from('bookings')
    .update({
      ...next,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.logoUrl !== undefined ? { logo_url: patch.logoUrl } : {}),
      ...(patch.showOnPublicSchedule !== undefined ? { show_on_public_schedule: patch.showOnPublicSchedule } : {}),
    })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) throw new Error(`booking update failed: ${error.message}`);

  await audit({ actorId: actorClerkId, action: 'booking.updated', target: `booking:${id}`, meta: { ...patch } });
  return { booking: data as BookingRecord, ...report };
}

/** Soft cancel: the engine and all schedules ignore canceled bookings. */
export async function cancelBooking(id: number, actorClerkId: string, reason?: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('bookings')
    .update({ canceled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`booking cancel failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'booking.canceled', target: `booking:${id}`, meta: { reason } });
}

/**
 * Every live booking owned by a source (see `sourceRef` on CreateBookingInput:
 * 'rental:12', 'rental-block:12', 'program:40', 'division:7', 'media-day:3').
 * Owners use this to find their slots instead of walking their own tables.
 */
export async function listBookingsBySourceRef(sourceRef: string): Promise<BookingRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from('bookings')
    .select(COLS)
    .eq('source_ref', sourceRef)
    .is('canceled_at', null)
    .order('starts_at');
  if (error) throw new Error(`bookings by source failed: ${error.message}`);
  return (data ?? []) as BookingRecord[];
}

/** Soft-cancel every live booking a source owns. Returns how many were released. */
export async function cancelBookingsBySourceRef(sourceRef: string, actorClerkId: string, reason?: string): Promise<number> {
  const live = await listBookingsBySourceRef(sourceRef);
  for (const b of live) await cancelBooking(b.id, actorClerkId, reason);
  return live.length;
}

/** One slot of a planned batch; `key` is echoed back so callers can correlate results. */
export interface PlannedSlot {
  startsAt: string;
  endsAt: string;
  key?: string;
}

export type BulkBookingResult = Array<{ key?: string; booking: BookingRecord } & AvailabilityReport>;

/**
 * Create many bookings for ONE facility in a handful of round-trips: the
 * facility tree, the live bookings in the batch's overall window and the
 * closures are loaded ONCE; conflicts, hours and closure warnings are computed
 * in memory per slot (against existing bookings — occurrences of the same
 * series never overlap each other); the rows are inserted in one statement
 * and audited as one batch. This is what recurring series and rental series
 * build on — a 200-occurrence weekly rental costs ~5 queries instead of ~3,000.
 */
export async function createBookingsBulk(
  base: Omit<CreateBookingInput, 'startsAt' | 'endsAt'>,
  slots: PlannedSlot[],
): Promise<BulkBookingResult> {
  if (slots.length === 0) return [];
  const tree = await facilityRows();
  assertBookable(tree, base.facilityId);

  const windowStart = slots.reduce((a, s) => (s.startsAt < a ? s.startsAt : a), slots[0].startsAt);
  const windowEnd = slots.reduce((a, s) => (s.endsAt > a ? s.endsAt : a), slots[0].endsAt);
  const [existing, closures] = await Promise.all([candidateBookings(windowStart, windowEnd), closureRows(windowStart, windowEnd)]);

  const reports = slots.map((slot) => {
    const probe = { facility_id: base.facilityId, starts_at: slot.startsAt, ends_at: slot.endsAt, setup_minutes: base.setupMinutes, cleanup_minutes: base.cleanupMinutes };
    const conflicts = findConflicts(tree, existing, probe);
    const hoursWarning = checkOperatingHours(tree, probe);
    return {
      available: conflicts.length === 0,
      conflicts,
      warnings: hoursWarning ? [hoursWarning] : [],
      closures: checkClosures(tree, closures, probe),
    };
  });

  const showPublic = base.showOnPublicSchedule ?? (base.source === 'program' || base.source === 'event');
  const rows = slots.map((slot) => ({
    facility_id: base.facilityId,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
    source: base.source,
    status: base.status ?? 'confirmed',
    is_internal: base.isInternal ?? base.source === 'internal',
    title: base.title.trim(),
    logo_url: base.logoUrl ?? null,
    show_on_public_schedule: showPublic,
    source_ref: base.sourceRef ?? null,
    setup_minutes: base.setupMinutes ?? 0,
    cleanup_minutes: base.cleanupMinutes ?? 0,
    series_id: base.seriesId ?? null,
    family_id: base.familyId ?? null,
    created_by: base.actorClerkId,
  }));
  const { data, error } = await supabaseAdmin().from('bookings').insert(rows).select(COLS).order('id');
  if (error) throw new Error(`bookings bulk create failed: ${error.message}`);
  const created = (data ?? []) as BookingRecord[];
  if (created.length !== slots.length) throw new Error(`bookings bulk create returned ${created.length} of ${slots.length} rows`);

  // Rows come back by id; ids are assigned in insert order, so index i ↔ slot i.
  await audit({
    actorId: base.actorClerkId,
    action: 'bookings.bulk-created',
    target: base.seriesId ? `booking_series:${base.seriesId}` : `facility:${base.facilityId}`,
    meta: { count: created.length, source: base.source, conflicted: reports.filter((r) => r.conflicts.length).length, sourceRef: base.sourceRef ?? null },
  });
  return created.map((booking, i) => ({ key: slots[i].key, booking, ...reports[i] }));
}

// ---------------------------------------------------------------------------
// Recurring bookings (Stage 4) - the API Module 4's program builder calls.
// ---------------------------------------------------------------------------

export interface CreateSeriesInput extends Omit<CreateBookingInput, 'startsAt' | 'endsAt' | 'seriesId'> {
  pattern: import('@ai/foundation').WeeklyPattern;
  startDate: string; // YYYY-MM-DD Toronto
  startTime: string; // HH:MM Toronto wall time
  endTime: string;
  until?: string;
  count?: number;
}

export interface SeriesResult {
  seriesId: number;
  occurrences: Array<{ date: string; booking: BookingRecord; conflicts: Conflict[]; warnings: HoursWarning[]; closures: ClosureWarning[] }>;
  /** Dates whose occurrence collided - resolve individually in the queue. */
  conflictedDates: string[];
}

/**
 * Create a recurring series: expands the pattern (DST-correct Toronto wall
 * time), inserts each occurrence as its own booking (series_id set), and
 * reports per-DATE conflicts so a collision on one instance is resolved for
 * just that date - the rest of the series stands (spec).
 */
export async function createRecurringBookings(input: CreateSeriesInput): Promise<SeriesResult> {
  const { expandRecurrence } = await import('@ai/foundation');
  const occurrences = expandRecurrence({
    pattern: input.pattern,
    startDate: input.startDate,
    startTime: input.startTime,
    endTime: input.endTime,
    until: input.until,
    count: input.count,
  });
  if (occurrences.length === 0) throw new Error('Pattern generates no occurrences.');

  const { data: series, error } = await supabaseAdmin()
    .from('booking_series')
    .insert({
      pattern: input.pattern,
      start_date: input.startDate,
      start_time: input.startTime,
      end_time: input.endTime,
      until_date: input.until ?? null,
      occurrence_count: input.count ?? null,
      facility_id: input.facilityId,
      title: input.title.trim(),
      source: input.source,
      created_by: input.actorClerkId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`series create failed: ${error.message}`);

  // Explicit field pass-through (no ...input spread): only the booking
  // fields travel, never whatever else the caller's object carries.
  const created = await createBookingsBulk(
    {
      facilityId: input.facilityId,
      source: input.source,
      title: input.title,
      status: input.status,
      isInternal: input.isInternal,
      logoUrl: input.logoUrl,
      showOnPublicSchedule: input.showOnPublicSchedule,
      sourceRef: input.sourceRef,
      setupMinutes: input.setupMinutes,
      cleanupMinutes: input.cleanupMinutes,
      seriesId: series.id,
      familyId: input.familyId,
      actorClerkId: input.actorClerkId,
    },
    occurrences.map((occ) => ({ startsAt: occ.starts_at, endsAt: occ.ends_at, key: occ.date })),
  );
  const results: SeriesResult['occurrences'] = created.map((c) => ({
    date: c.key!,
    booking: c.booking,
    conflicts: c.conflicts,
    warnings: c.warnings,
    closures: c.closures,
  }));

  await audit({
    actorId: input.actorClerkId,
    action: 'booking_series.created',
    target: `booking_series:${series.id}`,
    meta: { occurrences: results.length, conflicted: results.filter((r) => r.conflicts.length).length },
  });

  return {
    seriesId: series.id,
    occurrences: results,
    conflictedDates: results.filter((r) => r.conflicts.length > 0).map((r) => r.date),
  };
}

export interface ListBookingsFilter {
  from: string;
  to: string;
  facilityIds?: number[];
  sources?: BookingRecord['source'][];
  statuses?: BookingRecord['status'][];
  publicOnly?: boolean;
  familyId?: number;
}

export async function listBookings(filter: ListBookingsFilter): Promise<BookingRecord[]> {
  let q = supabaseAdmin()
    .from('bookings')
    .select(COLS)
    .is('canceled_at', null)
    .lt('starts_at', filter.to)
    .gt('ends_at', filter.from)
    .order('starts_at');
  if (filter.facilityIds?.length) q = q.in('facility_id', filter.facilityIds);
  if (filter.sources?.length) q = q.in('source', filter.sources);
  if (filter.statuses?.length) q = q.in('status', filter.statuses);
  if (filter.publicOnly) q = q.eq('show_on_public_schedule', true);
  if (filter.familyId) q = q.eq('family_id', filter.familyId);
  const { data, error } = await q;
  if (error) throw new Error(`bookings list failed: ${error.message}`);
  return (data ?? []) as BookingRecord[];
}

/**
 * One booking by id, for the edit screen. Unlike listBookings this DOES return
 * canceled rows - the edit screen shows a cancelled booking read-only rather
 * than 404ing on a link someone kept open. Null when the id doesn't exist.
 */
export async function getBooking(id: number): Promise<BookingRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from('bookings')
    .select(COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`booking read failed: ${error.message}`);
  return (data as BookingRecord | null) ?? null;
}
