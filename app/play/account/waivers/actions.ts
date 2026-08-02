'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { getWaiver, signWaiver } from '@/lib/waivers';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Sign a program waiver as the household. The one-per-family rule keys the
 * signature to the family's HoH profile, so only the HoH's signature
 * satisfies the gate — enforced here, explained on the page for everyone else.
 */
export async function signProgramWaiverAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  if (!session.userId || !session.profileId || !session.familyId) throw new Error('Sign in first.');

  const programId = Number(formData.get('programId'));
  const waiverId = Number(formData.get('waiverId'));
  const signatureText = String(formData.get('signature') ?? '').trim();
  if (!programId || !waiverId) throw new Error('Missing waiver reference.');

  const db = supabaseAdmin();
  const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', session.familyId).single();
  if (fam?.hoh_profile_id !== session.profileId) {
    throw new Error('Program waivers are signed by the Head of Household.');
  }
  // The waiver signed must be the one currently attached to the program.
  const { data: program } = await db.from('programs').select('waiver_id').eq('id', programId).single();
  if (program?.waiver_id !== waiverId) throw new Error('This waiver is no longer current — reload the page.');
  const waiver = await getWaiver(waiverId);
  if (!waiver) throw new Error('Waiver not found.');

  await signWaiver({
    waiverId,
    entityType: 'program',
    entityId: programId,
    signerName: signatureText,
    signerEmail: session.email,
    signerProfileId: session.profileId,
    signatureText,
  });
  revalidatePath('/account/waivers');
  revalidatePath('/account');
}
