'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import {
  createClosure,
  createFacility,
  deleteClosure,
  moveFacility,
  reorderFacility,
  restoreFacility,
  softDeleteFacility,
  updateFacility,
} from '@/lib/facilities';
import { createLocation } from '@/lib/locations';
import type { HoursWindow } from '@ai/foundation';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function createFacilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Name is required.');
  const parentRaw = String(formData.get('parentId') ?? '');
  await createFacility(
    {
      name,
      label: String(formData.get('label') ?? '').trim() || null,
      parentId: parentRaw ? Number(parentRaw) : null,
      bookable: formData.get('bookable') === 'on',
    },
    session.userId!,
  );
  revalidatePath('/facilities');
}

export async function updateFacilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  await updateFacility(
    id,
    {
      name: String(formData.get('name') ?? '').trim(),
      label: String(formData.get('label') ?? '').trim() || null,
      bookable: formData.get('bookable') === 'on',
    },
    session.userId!,
  );
  revalidatePath('/facilities');
}

/**
 * Save one node's weekday hours. The form posts open-N/close-N per weekday;
 * a row with either field blank means "closed that day". No rows at all
 * clears the override so the node inherits from its nearest ancestor.
 */
export async function updateHoursAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));

  if (formData.get('inherit') === 'on') {
    await updateFacility(id, { hoursWindows: null }, session.userId!);
    revalidatePath('/facilities');
    return;
  }

  const windows: HoursWindow[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const open = String(formData.get(`open-${weekday}`) ?? '').trim();
    const close = String(formData.get(`close-${weekday}`) ?? '').trim();
    if (open && close) windows.push({ weekday, open, close });
  }
  await updateFacility(id, { hoursWindows: windows }, session.userId!);
  revalidatePath('/facilities');
}

export async function updateLocationBindingAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const raw = String(formData.get('locationId') ?? '');
  await updateFacility(
    Number(formData.get('id')),
    { locationId: raw ? Number(raw) : null },
    session.userId!,
  );
  revalidatePath('/facilities');
}

export async function createLocationAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Name is required.');
  await createLocation({ name, city: String(formData.get('city') ?? '').trim() || null }, session.userId!);
  revalidatePath('/facilities');
}

export async function createClosureAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const startsOn = String(formData.get('startsOn') ?? '').trim();
  const endsOn = String(formData.get('endsOn') ?? '').trim();
  if (!startsOn || !endsOn) throw new Error('Both dates are required.');
  await createClosure(
    {
      facilityId: Number(formData.get('facilityId')),
      startsOn,
      endsOn,
      reason: String(formData.get('reason') ?? '').trim() || null,
    },
    session.userId!,
  );
  revalidatePath('/facilities');
}

export async function deleteClosureAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await deleteClosure(Number(formData.get('id')), session.userId!);
  revalidatePath('/facilities');
}

export async function moveFacilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  const parentRaw = String(formData.get('parentId') ?? '');
  await moveFacility(id, parentRaw ? Number(parentRaw) : null, session.userId!);
  revalidatePath('/facilities');
}

export async function reorderFacilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await reorderFacility(
    Number(formData.get('id')),
    String(formData.get('direction')) === 'up' ? 'up' : 'down',
    session.userId!,
  );
  revalidatePath('/facilities');
}

export async function softDeleteFacilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await softDeleteFacility(Number(formData.get('id')), session.userId!);
  revalidatePath('/facilities');
}

export async function restoreFacilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await restoreFacility(Number(formData.get('id')), session.userId!);
  revalidatePath('/facilities');
}
