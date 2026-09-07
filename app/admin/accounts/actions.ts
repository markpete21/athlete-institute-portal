'use server';

import { revalidatePath } from 'next/cache';
import { MANAGE_ROLES } from '@/lib/access/capabilities';
import { ACCOUNT_TYPE_VALUES, setAccountType } from '@/lib/access/roles';
import { requireStaffCapability } from '@/lib/auth';
import { id, oneOfOrThrow } from '@/lib/forms';

/** Account type drives access (staff ⇒ admin.*, tenant ⇒ read-only), so it is a manage_roles operation. */
export async function setAccountTypeAction(formData: FormData): Promise<void> {
  const session = await requireStaffCapability(MANAGE_ROLES, 'edit', 'Only an administrator with the manage-roles permission can change account types.');
  const profileId = id(formData.get('profileId'), 'account');
  const userType = oneOfOrThrow(formData.get('userType'), ACCOUNT_TYPE_VALUES, 'account type');
  await setAccountType(session, profileId, userType);
  revalidatePath('/accounts');
}
