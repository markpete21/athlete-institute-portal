import 'server-only';
import {
  audit,
  checkOperatingHours,
  findConflicts,
  type BookingInterval,
  type Conflict,
  type FacilityHours,
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
  source: 'rental' | 'program' | 'event' | 'internal';
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
  warnings: HoursWarning[];
}

const COLS =
  'id, facility_id, starts_at, ends_at, source, status, is_internal, title, logo_url, show_on_public_schedule, source_ref, setup_minutes, cleanup_minutes, series_id, canceled_at';

/** Widest buffer we account for when pre-filtering by time in SQL. */
const MAX_BUFFER_MIN = 480;

async function facilityRows(): Promise<FacilityHours[]> {
  const { data, error } = await supabaseAdmin()
    .from('facilities')
    .select('id, parent_id, name, label, sort_order, bookable, deleted_at, hours_open, hours_close')
    .is('deleted_at', null);
  if (error) throw new Error(`facilities read failed: ${error.message}`);
  return (data ?? []) as FacilityHours[];
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
  const [tree, bookings] = await Promise.all([
    facilityRows(),
    candidateBookings(slot.startsAt, slot.endsAt),
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
  };
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<{ booking: BookingRecord } & AvailabilityReport> {
  const tree = await facilityRows();
  const node = tree.find((f) => f.id === input.facilityId);
  if (!node) throw new Error(`Facility ${input.facilityId} not found (or deleted).`);
  if (!node.bookable) throw new Error(`"${node.name}" is not bookable.`);

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
  const { data: cur, error: e0 } = await db.from('bookings').select(COLS).eq('id', id).single();
  if (e0) throw new Error(`booking read failed: ${e0.message}`);

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
  occurrences: Array<{ date: string; booking: BookingRecord; conflicts: Conflict[]; warnings: HoursWarning[] }>;
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

  const results: SeriesResult['occurrences'] = [];
  for (const occ of occurrences) {
    const created = await createBooking({
      ...input,
      startsAt: occ.starts_at,
      endsAt: occ.ends_at,
      seriesId: series.id,
    });
    results.push({ date: occ.date, booking: created.booking, conflicts: created.conflicts, warnings: created.warnings });
  }

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
