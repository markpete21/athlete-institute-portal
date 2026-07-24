'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { respondToOffer } from '@/lib/academy/academy';

/** Public: player/parent accepts or declines an Academy enrollment offer. */
export async function respondAcademyOfferAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  const token = String(formData.get('token'));
  await respondToOffer(token, formData.get('accept') === 'yes', session.userId ?? `offer-link:${token.slice(0, 8)}`);
  revalidatePath(`/academy/offer/${token}`);
}
