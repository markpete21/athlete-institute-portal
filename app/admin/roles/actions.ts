'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { MANAGE_ROLES } from '@/lib/access/capabilities';
import { grantRole, revokeRoleAssignment } from '@/lib/access/roles';
import { requireStaffCapability } from '@/lib/auth';
import { id, strOrNull, strOrThrow } from '@/lib/forms';

/**
 * Role administration. Every mutation needs the `manage_roles` security root
 * (the admin layout lets any role-holder SEE this page; only root may change
 * it) and goes through lib/access/roles, which enforces no-self-grant and
 * last-root-holder invariants.
 */
const requireRoleAdmin = () => requireStaffCapability(MANAGE_ROLES, 'edit', 'Only an administrator with the manage-roles permission can change roles.');

export async function createRoleAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  const name = strOrThrow(formData.get('name'), 'Role name');
  const description = strOrNull(formData.get('description'));

  const { data, error } = await supabaseAdmin().from('roles').insert({ name, description }).select('id').single();
  if (error) throw new Error(`Role create failed: ${error.message}`);
  await audit({ actorId: session.userId, action: 'role.created', target: `role:${data.id}`, meta: { name } });
  revalidatePath('/roles');
}

export async function updateRoleAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  const roleId = id(formData.get('roleId'), 'role');
  const name = strOrThrow(formData.get('name'), 'Role name');
  const description = strOrNull(formData.get('description'));

  const { error } = await supabaseAdmin().from('roles').update({ name, description }).eq('id', roleId);
  if (error) throw new Error(`Role update failed: ${error.message}`);
  await audit({ actorId: session.userId, action: 'role.updated', target: `role:${roleId}`, meta: { name } });
  revalidatePath('/roles');
}

export async function assignRoleAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  const roleId = id(formData.get('roleId'), 'role');
  const email = strOrThrow(formData.get('email'), 'Email').toLowerCase();

  const { data: profile, error } = await supabaseAdmin().from('profiles').select('id').ilike('email', email).maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  if (!profile) throw new Error(`No account found for ${email} — they need to sign in to the portal once first.`);

  await grantRole(session, profile.id, roleId);
  revalidatePath('/roles');
}

export async function unassignRoleAction(formData: FormData): Promise<void> {
  const session = await requireRoleAdmin();
  await revokeRoleAssignment(session, id(formData.get('assignmentId'), 'assignment'));
  revalidatePath('/roles');
}
