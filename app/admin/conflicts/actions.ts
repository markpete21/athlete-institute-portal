'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
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

export async function keepBothAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const a = Number(formData.get('bookingA'));
  const b = Number(formData.get('bookingB'));
  const note = String(formData.get('note') ?? '').trim() || undefined;
  if (!a || !b) throw new Error('Booking ids required.');
  await keepBoth(a, b, session.userId!, { note });
  revalidatePath('/conflicts');
}
