'use server';

import { revalidatePath } from 'next/cache';
import { torontoInstant } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { updateBooking } from '@/lib/bookings';
import { keepBoth, resolveByCancel } from '@/lib/conflicts';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function cancelSideAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const loserId = Number(formData.get('loserId'));
  if (!loserId) throw new Error('Booking id required.');
  await resolveByCancel(loserId, session.userId!);
  revalidatePath('/conflicts');
}

/**
 * Edit BOTH sides of a conflict pair in one go (the resolve-by-edit path):
 * each booking gets a new Toronto date + start/end. updateBooking re-runs the
 * availability engine, so if the edit clears the overlap the pair drops out
 * of the queue on revalidate - and if it doesn't, it stays visible.
 */
export async function editPairAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  for (const side of ['a', 'b'] as const) {
    const id = Number(formData.get(`id-${side}`));
    const date = String(formData.get(`date-${side}`) ?? '').trim();
    const start = String(formData.get(`start-${side}`) ?? '').trim();
    const end = String(formData.get(`end-${side}`) ?? '').trim();
    if (!id) throw new Error('Booking id required.');
    if (!DATE.test(date) || !HHMM.test(start) || !HHMM.test(end)) {
      throw new Error('Each side needs a date and HH:MM start/end.');
    }
    if (end <= start) throw new Error('End time must be after start time.');
    await updateBooking(
      id,
      // torontoInstant is DST-correct wall-clock -> instant
      { startsAt: torontoInstant(date, start), endsAt: torontoInstant(date, end) },
      session.userId!,
    );
  }
  revalidatePath('/conflicts');
  revalidatePath('/schedule');
}

export async function keepBothAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const a = Number(formData.get('bookingA'));
  const b = Number(formData.get('bookingB'));
  const note = String(formData.get('note') ?? '').trim() || undefined;
  if (!a || !b) throw new Error('Booking ids required.');
  await keepBoth(a, b, session.userId!, { note });
  revalidatePath('/conflicts');
}
