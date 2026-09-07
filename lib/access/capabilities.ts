import 'server-only';
import { audit, can, resolveCapabilities, type CapabilityGrant, type ResolvedCapability } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * The capability matrix (Module 5 Stage 4) — role × capability → view/edit.
 *
 * This is the portal's permission system, so it lives under lib/access rather
 * than lib/staff: `requireStaffCapability()` in lib/auth and every admin
 * surface that gates a sensitive operation resolve through here.
 *
 * Capabilities are open-ended strings (staff can add keys from the matrix
 * UI), but the ones the code itself gates on are declared in CAPABILITIES so
 * a rename is a one-line change and the UI can label them.
 */

export const CAPABILITIES = [
  { key: 'roster_names', label: 'Roster — names' },
  { key: 'roster_sensitive', label: 'Roster — sensitive (medical, contacts, DOB)' },
  { key: 'schedule', label: 'Program schedule' },
  { key: 'pay', label: 'Pay info' },
  { key: 'score_entry', label: 'Score entry (M6)' },
  { key: 'camp_checkin', label: 'Camp check-in/out (M8)' },
  { key: 'manage_roles', label: 'Roles, permissions & account types (security root)' },
] as const;

export type CapabilityKey = (typeof CAPABILITIES)[number]['key'];

/**
 * The security root: whoever holds `manage_roles` (edit) can change who is
 * staff and what every role may do. It is deliberately NOT editable from the
 * matrix UI — see lib/access/roles.ts — so a role-holder can never grant it
 * to themselves; it is seeded on the system Admin role (migration 0064).
 */
export const MANAGE_ROLES: CapabilityKey = 'manage_roles';

export async function setCapability(roleId: number, capability: string, canView: boolean, canEdit: boolean, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('role_capabilities')
    .upsert({ role_id: roleId, capability, can_view: canView, can_edit: canEdit }, { onConflict: 'role_id,capability' });
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'capability.set', target: `role:${roleId}`, meta: { capability, canView, canEdit } });
}

/** Resolve a profile's effective capabilities across all their roles. */
export async function capabilitiesForProfile(profileId: number): Promise<Record<string, ResolvedCapability>> {
  const db = supabaseAdmin();
  const { data: roleRows, error } = await db.from('role_assignments').select('role_id').eq('profile_id', profileId);
  if (error) throw new Error(`role_assignments read failed: ${error.message}`);
  const roleIds = (roleRows ?? []).map((r) => r.role_id);
  if (!roleIds.length) return {};
  const { data: caps, error: e2 } = await db
    .from('role_capabilities')
    .select('role_id, capability, can_view, can_edit')
    .in('role_id', roleIds);
  if (e2) throw new Error(`role_capabilities read failed: ${e2.message}`);
  const byRole = new Map<number, CapabilityGrant[]>();
  for (const c of caps ?? []) {
    byRole.set(c.role_id, [...(byRole.get(c.role_id) ?? []), { capability: c.capability, can_view: c.can_view, can_edit: c.can_edit }]);
  }
  return resolveCapabilities([...byRole.values()]);
}

export async function profileCan(profileId: number, capability: string, mode: 'view' | 'edit' = 'view'): Promise<boolean> {
  return can(await capabilitiesForProfile(profileId), capability, mode);
}
