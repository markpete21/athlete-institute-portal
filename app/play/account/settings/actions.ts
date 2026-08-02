'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { updateTypeSettings } from '@/lib/type-settings';

/**
 * Self-serve account settings — the first place a family can edit anything
 * about themselves. Phone lives on profiles; the marketing opt-in (CASL:
 * explicit, defaults off) lives in the typed per-user-type settings.
 */
export async function updateMySettingsAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  if (!session.userId || !session.profileId) throw new Error('Sign in first.');

  const phone = String(formData.get('phone') ?? '').trim() || null;
  if (phone && !/^[0-9+()\-.\s]{7,20}$/.test(phone)) {
    throw new Error('That phone number does not look right.');
  }
  const { error } = await supabaseAdmin().from('profiles').update({ phone }).eq('id', session.profileId);
  if (error) throw new Error(`settings save failed: ${error.message}`);

  if (session.userType === 'customer') {
    await updateTypeSettings<'customer'>(session.profileId, {
      marketingOptIn: formData.get('marketingOptIn') === 'on',
    });
  }

  await audit({
    actorId: session.userId,
    action: 'profile.settings-updated',
    target: `profile:${session.profileId}`,
    meta: { fields: ['phone', ...(session.userType === 'customer' ? ['marketingOptIn'] : [])] },
  });
  revalidatePath('/account/settings');
}
