'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';

/**
 * The three high-level account types (plus tenant from Module 1). Stored
 * values are Module 1's originals - 'customer' DISPLAYS as "Member"
 * everywhere; renaming the stored value would touch 17 call sites for zero
 * behaviour change. Staff is an account type, not a cage: staff accounts
 * register for programs like anyone else.
 */
export const ACCOUNT_TYPES = [
  { value: 'customer', label: 'Member' },
  { value: 'organization', label: 'Organization' },
  { value: 'staff', label: 'Staff' },
  { value: 'tenant', label: 'Tenant' },
] as const;

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
