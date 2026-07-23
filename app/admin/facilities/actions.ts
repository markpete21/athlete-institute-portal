'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import {
  createFacility,
  moveFacility,
  reorderFacility,
  restoreFacility,
  softDeleteFacility,
  updateFacility,
} from '@/lib/facilities';

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
