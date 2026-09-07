'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff, requireStaffCapability } from '@/lib/auth';
import { checkIn, checkOut, createWeek } from '@/lib/camps/camps';

export async function createWeekAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const programId = Number(formData.get('programId'));
  await createWeek({
    programId,
    name: String(formData.get('name') ?? '').trim() || 'Week',
    startDate: String(formData.get('startDate')),
    endDate: String(formData.get('endDate')),
    dailyStart: String(formData.get('dailyStart') ?? '') || undefined,
    dailyEnd: String(formData.get('dailyEnd') ?? '') || undefined,
    overnight: formData.get('overnight') === 'on',
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : null,
    priceCents: Math.round(Number(formData.get('price') ?? 0) * 100) || 0,
  }, session.userId);
  revalidatePath(`/camps/${programId}`);
}

// Check-in/out gated by the Module 5 camp_checkin capability.
const requireCheckinCap = () => requireStaffCapability('camp_checkin', 'edit', 'You lack the camp check-in capability.');

export async function checkInAction(formData: FormData): Promise<void> {
  const s = await requireCheckinCap();
  const weekId = Number(formData.get('campWeekId'));
  await checkIn({ registrationId: Number(formData.get('registrationId')), campWeekId: weekId, dayISO: String(formData.get('day')), staffClerkId: s.userId });
  revalidatePath(`/camps/checkin/${weekId}`);
}

export async function checkOutAction(formData: FormData): Promise<void> {
  const s = await requireCheckinCap();
  const weekId = Number(formData.get('campWeekId'));
  await checkOut({ registrationId: Number(formData.get('registrationId')), dayISO: String(formData.get('day')), authorizedPickup: String(formData.get('pickup') ?? '').trim() || 'Guardian', staffClerkId: s.userId });
  revalidatePath(`/camps/checkin/${weekId}`);
}
