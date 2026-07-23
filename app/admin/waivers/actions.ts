'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { createWaiver, updateWaiver } from '@/lib/waivers';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function createWaiverAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!name || !body) throw new Error('Name and body are required.');
  await createWaiver(
    { name, body, defaultForBookingType: String(formData.get('defaultForBookingType') ?? '') || null },
    session.userId!,
  );
  revalidatePath('/waivers');
}

export async function updateWaiverAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  await updateWaiver(
    id,
    {
      name: String(formData.get('name') ?? '').trim(),
      body: String(formData.get('body') ?? ''),
      active: formData.get('active') === 'on',
      defaultForBookingType: String(formData.get('defaultForBookingType') ?? '') || null,
    },
    session.userId!,
  );
  revalidatePath('/waivers');
}
