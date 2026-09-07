'use server';

import { torontoInstant } from '@ai/foundation';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import {
  addRentalAddon,
  addRentalLine,
  createRental,
  emailQuoteLink,
  removeRentalAddon,
  removeRentalLine,
  updateRentalDetails,
} from '@/lib/rentals/quotes';

export async function createRentalAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const isInternal = formData.get('isInternal') === 'on';
  const rental = await createRental({
    title: String(formData.get('title') ?? '').trim() || 'Untitled rental',
    isInternal,
    businessUnitId: formData.get('businessUnitId') ? Number(formData.get('businessUnitId')) : null,
    bookingType: String(formData.get('bookingType') ?? '') || null,
    bookingTypeOther: String(formData.get('bookingTypeOther') ?? '').trim() || null,
    contactName: String(formData.get('contactName') ?? '').trim() || null,
    contactEmail: String(formData.get('contactEmail') ?? '').trim() || null,
    contactPhone: String(formData.get('contactPhone') ?? '').trim() || null,
    depositPct: Number(formData.get('depositPct')) || 25,
    actorClerkId: session.userId,
  });
  redirect(`/rentals/${rental.id}`);
}

export async function addLineAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  const date = String(formData.get('date') ?? '');
  const start = String(formData.get('start') ?? '');
  const end = String(formData.get('end') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error('Date, start and end are required.');
  if (end <= start) throw new Error('End time must be after the start time.');
  const overrideRaw = String(formData.get('rateOverride') ?? '').trim();

  await addRentalLine({
    rentalId,
    facilityId: Number(formData.get('facilityId')),
    rateMode: String(formData.get('rateMode') ?? 'hourly') as 'hourly' | 'full_day' | 'flat',
    startsAt: torontoInstant(date, start),
    endsAt: torontoInstant(date, end),
    rateCentsOverride: overrideRaw ? Math.round(Number(overrideRaw) * 100) : undefined,
    actorClerkId: session.userId,
  });
  revalidatePath(`/rentals/${rentalId}`);
}

export async function removeLineAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  await removeRentalLine(Number(formData.get('lineId')), session.userId);
  revalidatePath(`/rentals/${rentalId}`);
}

export async function addAddonAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  await addRentalAddon({
    rentalId,
    addonId: Number(formData.get('addonId')),
    lineId: formData.get('lineId') ? Number(formData.get('lineId')) : null,
    qty: Number(formData.get('qty')) || 1,
    actorClerkId: session.userId,
  });
  revalidatePath(`/rentals/${rentalId}`);
}

export async function removeAddonAction(formData: FormData): Promise<void> {
  await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  await removeRentalAddon(Number(formData.get('addonRowId')));
  revalidatePath(`/rentals/${rentalId}`);
}

export async function emailQuoteAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  await emailQuoteLink(rentalId, session.userId);
  revalidatePath(`/rentals/${rentalId}`);
}

export async function markBookedAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  const { markRentalBooked } = await import('@/lib/rentals/payments');
  await markRentalBooked(rentalId, session.userId);
  revalidatePath(`/rentals/${rentalId}`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  const { recordManualPayment } = await import('@/lib/rentals/payments');
  await recordManualPayment(Number(formData.get('installmentId')), session.userId);
  revalidatePath(`/rentals/${rentalId}`);
}

export async function chargeInstallmentAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  const { processInstallment } = await import('@/lib/rentals/payments');
  await processInstallment(Number(formData.get('installmentId')), session.userId);
  revalidatePath(`/rentals/${rentalId}`);
}

export async function attachWaiverAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  const { attachWaiverToRental } = await import('@/lib/waivers');
  const wid = formData.get('waiverId') ? Number(formData.get('waiverId')) : null;
  await attachWaiverToRental(rentalId, wid, session.userId);
  revalidatePath(`/rentals/${rentalId}`);
}

export async function cancelRentalAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  const { cancelRental } = await import('@/lib/rentals/payments');
  await cancelRental(rentalId, session.userId, String(formData.get('reason') ?? '') || undefined);
  revalidatePath(`/rentals/${rentalId}`);
}

/**
 * Edit a rental's header details. Nothing could change these after creation,
 * so a wrong contact email meant rebuilding the quote from scratch.
 */
export async function updateRentalDetailsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const rentalId = Number(formData.get('rentalId'));
  if (!rentalId) throw new Error('Rental id required.');

  const orgRaw = String(formData.get('organizationId') ?? '');
  await updateRentalDetails(
    rentalId,
    {
      title: String(formData.get('title') ?? ''),
      bookingType: String(formData.get('bookingType') ?? '') || null,
      organizationId: orgRaw === '' ? null : Number(orgRaw),
      contactName: String(formData.get('contactName') ?? ''),
      contactEmail: String(formData.get('contactEmail') ?? ''),
      contactPhone: String(formData.get('contactPhone') ?? ''),
      notes: String(formData.get('notes') ?? ''),
      depositPct: Number(formData.get('depositPct')),
    },
    session.userId,
  );

  revalidatePath(`/rentals/${rentalId}`);
  revalidatePath('/rentals');
  revalidatePath('/rentals/invoices');
}
