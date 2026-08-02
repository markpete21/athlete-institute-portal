'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { torontoInstant } from '@ai/foundation';
import { BUCKETS, deleteFile, getPublicUrl, uploadFile } from '@ai/foundation/storage';
import { getPortalSession } from '@/lib/auth';
import { cancelBooking, getBooking, updateBooking } from '@/lib/bookings';

/**
 * Server actions for the booking edit screen. Everything routes through
 * updateBooking(), which re-runs the availability engine on each save, so an
 * edit that creates an overlap surfaces in the conflicts queue immediately
 * instead of silently double-booking a court.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

/** Revalidate every surface a booking edit can be visible on. */
function revalidateBooking(id: number): void {
  revalidatePath(`/schedule/booking/${id}`);
  revalidatePath('/schedule');
  revalidatePath('/conflicts');
}

/** Buffers are minutes; reject junk rather than silently coercing to 0. */
function minutes(fd: FormData, field: string): number {
  const raw = String(fd.get(field) ?? '').trim();
  if (raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 480) {
    throw new Error(`${field} must be a whole number of minutes between 0 and 480.`);
  }
  return n;
}

export async function saveBookingAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  if (!id) throw new Error('Booking id required.');

  const title = String(formData.get('title') ?? '').trim();
  if (!title) throw new Error('Title is required.');

  const date = String(formData.get('date') ?? '').trim();
  const start = String(formData.get('start') ?? '').trim();
  const end = String(formData.get('end') ?? '').trim();
  if (!DATE.test(date) || !HHMM.test(start) || !HHMM.test(end)) {
    throw new Error('A date and HH:MM start/end are required.');
  }
  if (end <= start) throw new Error('End time must be after start time.');

  const facilityId = Number(formData.get('facilityId'));
  if (!facilityId) throw new Error('Facility is required.');

  await updateBooking(
    id,
    {
      title,
      facilityId,
      // torontoInstant is DST-correct wall-clock -> instant.
      startsAt: torontoInstant(date, start),
      endsAt: torontoInstant(date, end),
      status: formData.get('status') === 'tentative' ? 'tentative' : 'confirmed',
      setupMinutes: minutes(formData, 'setupMinutes'),
      cleanupMinutes: minutes(formData, 'cleanupMinutes'),
      showOnPublicSchedule: formData.get('showPublic') === 'on',
    },
    session.userId!,
  );

  revalidateBooking(id);
}

/**
 * Upload the event logo shown next to the title on the TV display boards.
 * event-logos is a PUBLIC bucket (migration 0046) precisely because those
 * boards are unauthenticated and run unattended for weeks - a signed URL would
 * expire and leave a broken image on the wall.
 */
export async function uploadBookingLogoAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  if (!id) throw new Error('Booking id required.');

  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a logo file to upload.');
  if (file.size > MAX_LOGO_BYTES) throw new Error('Logo must be 2 MB or smaller.');
  if (!LOGO_TYPES.includes(file.type)) throw new Error('Logo must be a PNG, JPEG, WebP or SVG.');

  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  // Timestamped name so a re-upload busts the display board's image cache
  // instead of showing the previous crest until the CDN expires it.
  const path = `booking/${id}/logo-${Date.now()}.${ext}`;
  await uploadFile(BUCKETS.eventLogos, path, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: true,
  });

  const previous = await getBooking(id);
  await updateBooking(id, { logoUrl: getPublicUrl(BUCKETS.eventLogos, path) }, session.userId!);

  // Best-effort cleanup of the superseded object; a failure here must not
  // roll back a logo that is already live on the boards.
  const stale = objectPathOf(previous?.logo_url ?? null);
  if (stale && stale !== path) {
    try {
      await deleteFile(BUCKETS.eventLogos, [stale]);
    } catch {
      /* orphaned object only - the new logo is already saved */
    }
  }

  revalidateBooking(id);
}

export async function removeBookingLogoAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  if (!id) throw new Error('Booking id required.');

  const current = await getBooking(id);
  await updateBooking(id, { logoUrl: null }, session.userId!);

  const path = objectPathOf(current?.logo_url ?? null);
  if (path) {
    try {
      await deleteFile(BUCKETS.eventLogos, [path]);
    } catch {
      /* row is already cleared; a stray object is harmless */
    }
  }

  revalidateBooking(id);
}

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  if (!id) throw new Error('Booking id required.');
  const reason = String(formData.get('reason') ?? '').trim() || undefined;

  await cancelBooking(id, session.userId!, reason);
  revalidateBooking(id);
  redirect('/schedule');
}

/**
 * Recover the storage object path from a stored public URL. Returns null for
 * anything that isn't one of our own event-logos objects, so a hand-entered
 * external URL is never treated as a file we own and deleted.
 */
function objectPathOf(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKETS.eventLogos}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split('?')[0];
  return path || null;
}
