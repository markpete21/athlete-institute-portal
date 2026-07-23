'use server';

import { redirect } from 'next/navigation';
import { getRentalByToken } from '@/lib/rentals/quotes';
import { signWaiver } from '@/lib/waivers';

/**
 * Public waiver signing (the renter follows the quote link). No auth — the
 * unguessable quote token scopes it to one rental; the signer types their name.
 */
export async function signRentalWaiverAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const rental = await getRentalByToken(token);
  if (!rental) throw new Error('Quote not found.');
  if (!rental.waiver_id) throw new Error('No waiver attached to this rental.');

  const signatureText = String(formData.get('signatureText') ?? '').trim();
  const agree = formData.get('agree') === 'on';
  if (!agree) throw new Error('You must agree to the waiver terms.');

  await signWaiver({
    waiverId: rental.waiver_id,
    entityType: 'rental',
    entityId: rental.id,
    signerName: signatureText,
    signerEmail: rental.contact_email,
    signatureText,
  });

  redirect(`/quote/${token}?signed=1`);
}
