'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';

/** Staff-only guard (the admin layout already blocks, this defends the action). */
async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function createRoleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  if (!name) throw new Error('Role name is required.');

  const { data, error } = await supabaseAdmin()
    .from('roles')
    .insert({ name, description })
    .select('id')
    .single();
  if (error) throw new Error(`Role create failed: ${error.message}`);
  await audit({
    actorId: session.userId!,
    action: 'role.created',
    target: `role:${data.id}`,
    meta: { name },
  });
  revalidatePath('/roles');
}

export async function updateRoleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('roleId'));
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  if (!id || !name) throw new Error('Role id and name are required.');

  const { error } = await supabaseAdmin()
    .from('roles')
    .update({ name, description })
    .eq('id', id);
  if (error) throw new Error(`Role update failed: ${error.message}`);
  await audit({
    actorId: session.userId!,
    action: 'role.updated',
    target: `role:${id}`,
    meta: { name },
  });
  revalidatePath('/roles');
}

export async function assignRoleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const roleId = Number(formData.get('roleId'));
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!roleId || !email) throw new Error('Role and email are required.');

  const db = supabaseAdmin();
  const { data: profile, error } = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  if (!profile) {
    throw new Error(`No account found for ${email} — they need to sign in to the portal once first.`);
  }

  const { error: e2 } = await db
    .from('role_assignments')
    .insert({ profile_id: profile.id, role_id: roleId, granted_by: session.userId });
  if (e2 && !e2.message.includes('duplicate')) throw new Error(`Assignment failed: ${e2.message}`);
  await audit({
    actorId: session.userId!,
    action: 'role.granted',
    target: `profile:${profile.id}`,
    meta: { role_id: roleId, email },
  });
  revalidatePath('/roles');
}

export async function unassignRoleAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const assignmentId = Number(formData.get('assignmentId'));
  if (!assignmentId) throw new Error('Assignment id required.');

  const { error } = await supabaseAdmin().from('role_assignments').delete().eq('id', assignmentId);
  if (error) throw new Error(`Unassign failed: ${error.message}`);
  await audit({
    actorId: session.userId!,
    action: 'role.revoked',
    target: `role_assignment:${assignmentId}`,
  });
  revalidatePath('/roles');
}
