'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { respondToOffer } from '@/lib/club/club';

/** Public: player/parent confirms or denies a club offer via its digital link. */
export async function respondOfferAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  // The link itself is the credential, but a signed-in account that may not
  // transact (tenant / suspended) cannot accept on its behalf.
  if (session.userId && !session.canTransact) throw new Error('This account cannot accept offers. Contact us.');
  const token = String(formData.get('token'));
  const accept = formData.get('accept') === 'yes';
  await respondToOffer(token, accept, session.userId ?? `offer-link:${token.slice(0, 8)}`);
  revalidatePath(`/club/offer/${token}`);
}
