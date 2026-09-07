/**
 * Booking vocabulary shared by every module that creates or renders bookings
 * (Module 2 contract). PURE, edge-safe.
 *
 * Adding a booking source (e.g. an external calendar sync) means: add the key
 * here with its label/colour, add it to the DB check constraint, and every
 * schedule view, legend and filter picks it up — no per-page colour maps.
 */

export const BOOKING_SOURCES = ['rental', 'program', 'event', 'internal'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const BOOKING_SOURCE_META: Record<BookingSource, { label: string; color: string }> = {
  program: { label: 'Program', color: 'var(--accent)' },
  event: { label: 'Event', color: '#3f7a5b' },
  rental: { label: 'Rental', color: '#5b7a9e' },
  internal: { label: 'Internal', color: '#9ea1a1' },
};

export function isBookingSource(v: unknown): v is BookingSource {
  return typeof v === 'string' && (BOOKING_SOURCES as readonly string[]).includes(v);
}

export const BOOKING_STATUSES = ['tentative', 'confirmed'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * `bookings.source_ref` back-pointer: which row owns this booking. Typed so
 * owners cancel/reschedule by ref (lib/bookings listBookingsBySourceRef /
 * cancelBookingsBySourceRef) instead of walking their own tables.
 */
export const SOURCE_REF_KINDS = ['rental', 'rental-block', 'program', 'division', 'media-day', 'event'] as const;
export type SourceRefKind = (typeof SOURCE_REF_KINDS)[number];

export interface BookingSourceRef {
  kind: SourceRefKind;
  id: number;
}

export function formatSourceRef(ref: BookingSourceRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** Parse "rental-block:12" → { kind, id }; null for anything malformed or unknown. */
export function parseSourceRef(raw: string | null | undefined): BookingSourceRef | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf(':');
  if (idx <= 0) return null;
  const kind = raw.slice(0, idx);
  const id = Number(raw.slice(idx + 1));
  if (!(SOURCE_REF_KINDS as readonly string[]).includes(kind) || !Number.isInteger(id) || id <= 0) return null;
  return { kind: kind as SourceRefKind, id };
}
