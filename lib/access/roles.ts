import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { AuthError, type StaffSession } from '@/lib/auth';
import { MANAGE_ROLES, setCapability } from '@/lib/access/capabilities';

/**
 * Role administration — the ONLY write path for role_assignments,
 * role_capabilities and profiles.user_type. Every mutation here enforces the
 * invariants that keep the permission system from being escalated from the
 * inside:
 *
 *   1. The caller must hold `manage_roles` (edit) — or be a bootstrap admin
 *      from STAFF_ALLOWLIST_EMAILS. `requireStaffCapability(MANAGE_ROLES)`
 *      does that; these functions take the resulting StaffSession as proof.
 *   2. No self-service: a caller can never grant or revoke their OWN roles,
 *      nor change their own account type.
 *   3. The security root can't be edited from the UI: `manage_roles` rows are
 *      never written by setRoleCapability; they come from migrations only.
 *   4. Never revoke the last `manage_roles` holder — that would lock everyone
 *      out of role administration until a DB operator intervenes.
 *
 * Actions call these; nothing else should touch the underlying tables.
 */

async function roleHasManageRoles(roleId: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from('role_capabilities')
    .select('can_edit')
    .eq('role_id', roleId)
    .eq('capability', MANAGE_ROLES)
    .maybeSingle();
  if (error) throw new Error(`role_capabilities read failed: ${error.message}`);
  return !!data?.can_edit;
}

/** Profiles that hold manage_roles (edit) via any role. */
async function manageRolesHolders(): Promise<Set<number>> {
  const db = supabaseAdmin();
  const { data: caps, error } = await db.from('role_capabilities').select('role_id').eq('capability', MANAGE_ROLES).eq('can_edit', true);
  if (error) throw new Error(`role_capabilities read failed: ${error.message}`);
  const roleIds = (caps ?? []).map((c) => c.role_id);
  if (!roleIds.length) return new Set();
  const { data: rows, error: e2 } = await db.from('role_assignments').select('profile_id').in('role_id', roleIds);
  if (e2) throw new Error(`role_assignments read failed: ${e2.message}`);
  return new Set((rows ?? []).map((r) => r.profile_id as number));
}

/** Grant `roleId` to `profileId`. Idempotent (already-granted is a no-op). */
export async function grantRole(admin: StaffSession, profileId: number, roleId: number, via?: string): Promise<void> {
  if (profileId === admin.profileId) throw new AuthError('You cannot grant roles to your own account.');
  const db = supabaseAdmin();
  const { data: role, error: rErr } = await db.from('roles').select('id, name').eq('id', roleId).maybeSingle();
  if (rErr) throw new Error(`roles read failed: ${rErr.message}`);
  if (!role) throw new Error('Unknown role.');

  const { error } = await db
    .from('role_assignments')
    .upsert({ profile_id: profileId, role_id: roleId, granted_by: admin.userId }, { onConflict: 'profile_id,role_id', ignoreDuplicates: true });
  if (error) throw new Error(`Assignment failed: ${error.message}`);
  await audit({
    actorId: admin.userId,
    action: 'role.granted',
    target: `profile:${profileId}`,
    meta: { role_id: roleId, role: role.name, ...(via ? { via } : {}) },
  });
}

/** Revoke one role_assignments row. Refuses self-revocation and the last root holder. */
export async function revokeRoleAssignment(admin: StaffSession, assignmentId: number, via?: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: a, error } = await db.from('role_assignments').select('id, profile_id, role_id').eq('id', assignmentId).maybeSingle();
  if (error) throw new Error(`role_assignments read failed: ${error.message}`);
  if (!a) return; // already gone — revoking twice is not an error
  if (a.profile_id === admin.profileId) throw new AuthError('You cannot revoke your own roles.');

  if (await roleHasManageRoles(a.role_id)) {
    const holders = await manageRolesHolders();
    holders.delete(a.profile_id);
    if (holders.size === 0) throw new AuthError('That is the last account able to manage roles — grant another first.');
  }

  const { error: dErr } = await db.from('role_assignments').delete().eq('id', assignmentId);
  if (dErr) throw new Error(`Unassign failed: ${dErr.message}`);
  await audit({
    actorId: admin.userId,
    action: 'role.revoked',
    target: `profile:${a.profile_id}`,
    meta: { role_id: a.role_id, assignment_id: assignmentId, ...(via ? { via } : {}) },
  });
}

/** Set one cell of the matrix. The security root is never editable from here. */
export async function setRoleCapability(admin: StaffSession, roleId: number, capability: string, canView: boolean, canEdit: boolean): Promise<void> {
  if (capability === MANAGE_ROLES) throw new AuthError('The manage_roles capability is fixed to the Admin role and cannot be edited here.');
  await setCapability(roleId, capability, canView, canEdit, admin.userId);
}

/** Add a new capability key to the matrix by seeding it (view only) on one role. */
export async function addCapabilityKey(admin: StaffSession, rawKey: string, roleId: number): Promise<string> {
  const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) throw new Error('Capability key required.');
  if (key === MANAGE_ROLES) throw new AuthError('That key is reserved.');
  await setCapability(roleId, key, true, false, admin.userId);
  return key;
}

export const ACCOUNT_TYPE_VALUES = ['customer', 'organization', 'staff', 'tenant'] as const;
export type AccountType = (typeof ACCOUNT_TYPE_VALUES)[number];

/** Change an account's type. Never your own; demoting a root holder is refused. */
export async function setAccountType(admin: StaffSession, profileId: number, userType: AccountType): Promise<void> {
  if (profileId === admin.profileId) throw new AuthError('You cannot change your own account type.');
  const { error } = await supabaseAdmin().from('profiles').update({ user_type: userType }).eq('id', profileId);
  if (error) throw new Error(`account type change failed: ${error.message}`);
  await audit({ actorId: admin.userId, action: 'account.type-changed', target: `profile:${profileId}`, meta: { user_type: userType } });
}

/**
 * True when changing this profile's status or type is a security-sensitive
 * operation (it is staff or holds any role) and therefore needs manage_roles.
 */
export async function isPrivilegedProfile(profileId: number): Promise<boolean> {
  const db = supabaseAdmin();
  const [{ data: p }, { count }] = await Promise.all([
    db.from('profiles').select('user_type').eq('id', profileId).maybeSingle(),
    db.from('role_assignments').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
  ]);
  return p?.user_type === 'staff' || (count ?? 0) > 0;
}
