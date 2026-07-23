/**
 * Staff core (Module 5) - PURE, edge-safe. Status derivation + capability
 * matrix resolution used by the staff self-view gate and admin.
 */

export type StaffStatus = 'active' | 'inactive' | 'archived';

/**
 * Active if assigned to a current/upcoming program OR owed outstanding pay
 * (so they stay active until paid for finished work). Archive is a manual
 * override that wins over everything.
 */
export function deriveStaffStatus(input: {
  archived: boolean;
  hasCurrentOrUpcomingAssignment: boolean;
  hasOutstandingPay: boolean;
}): StaffStatus {
  if (input.archived) return 'archived';
  return input.hasCurrentOrUpcomingAssignment || input.hasOutstandingPay ? 'active' : 'inactive';
}

export interface CapabilityGrant {
  capability: string;
  can_view: boolean;
  can_edit: boolean;
}

export interface ResolvedCapability {
  view: boolean;
  edit: boolean;
}

/**
 * Resolve a person's effective capabilities across ALL their roles: a
 * capability is granted (view/edit) if ANY role grants it. sensitive roster
 * fields therefore require an explicit grant on at least one held role.
 */
export function resolveCapabilities(grantsByRole: CapabilityGrant[][]): Record<string, ResolvedCapability> {
  const out: Record<string, ResolvedCapability> = {};
  for (const grants of grantsByRole) {
    for (const g of grants) {
      const cur = out[g.capability] ?? { view: false, edit: false };
      out[g.capability] = { view: cur.view || g.can_view, edit: cur.edit || g.can_edit };
    }
  }
  return out;
}

export function can(caps: Record<string, ResolvedCapability>, capability: string, mode: 'view' | 'edit' = 'view'): boolean {
  const c = caps[capability];
  if (!c) return false;
  return mode === 'edit' ? c.edit : c.view;
}
