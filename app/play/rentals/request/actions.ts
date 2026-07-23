'use server';

import { redirect } from 'next/navigation';
import { audit } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { getPortalSession } from '@/lib/auth';
import { createRental } from '@/lib/rentals/quotes';

/**
 * Org/customer rental REQUEST (Module 3 Stage 7). An org agent (or customer)
 * submits what they want; this creates a quote-status rental for staff to
 * build + finalize, and notifies ops. Orgs never self-serve a booking - staff
 * own the quote, and the deposit is required like any external rental.
 */
export async function requestRentalAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  if (!session.userId) throw new Error('Sign in to request a rental.');

  const orgName = String(formData.get('orgName') ?? '').trim();
  const desired = String(formData.get('desired') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!desired) throw new Error('Tell us the dates/spaces you need.');

  const title = orgName ? `${orgName} — rental request` : 'Rental request';
  const rental = await createRental({
    title,
    profileId: session.profileId,
    familyId: session.familyId,
    contactEmail: session.email,
    notes: `REQUEST from ${session.email}\nOrg: ${orgName || '(individual)'}\nDesired: ${desired}\n${notes}`,
    actorClerkId: session.userId,
  });

  await audit({ actorId: session.userId, action: 'rental.requested', target: `rental:${rental.id}`, meta: { orgName } });
  await notify({
    to: { email: process.env.OPERATIONS_EMAIL ?? 'mark.peterson@athleteinstitute.ca' },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: 'New rental request',
      body: `${session.email}${orgName ? ` (${orgName})` : ''} requested a rental.\n\nDesired: ${desired}\n\n${notes}`,
      ctaLabel: 'Build the quote',
      ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/rentals/${rental.id}`,
    },
  });

  redirect('/rentals/request?sent=1');
}
