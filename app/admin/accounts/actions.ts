'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { ACCOUNT_TYPES } from './types';

export async function setAccountTypeAction(formData: FormData): Promise<void> {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  const profileId = Number(formData.get('profileId'));
  const userType = String(formData.get('userType'));
  if (!ACCOUNT_TYPES.some((t) => t.value === userType)) throw new Error('Unknown account type.');
  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({ user_type: userType })
    .eq('id', profileId);
  if (error) throw new Error(`account type change failed: ${error.message}`);
  await audit({
    actorId: session.userId!,
    action: 'account.type-changed',
    target: `profile:${profileId}`,
    meta: { user_type: userType },
  });
  revalidatePath('/accounts');
}
