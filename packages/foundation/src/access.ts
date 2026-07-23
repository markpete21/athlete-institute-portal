/**
 * Access policy — PURE, edge-safe, no Clerk import (so middleware and server
 * code share one source of truth and it's unit-testable).
 *
 * Module 1 owns the real user-type + role model (a Supabase `roles` table and
 * `role_assignments`). Until that exists, roles/type are read from Clerk
 * `publicMetadata`, plus a bootstrap **staff email allowlist** so the first
 * admins can reach admin.* with zero dashboard setup — the same pattern the
 * live app uses. When Module 1 lands, `resolveAccess` keeps its signature; only
 * the caller's data source changes (metadata → DB).
 */

/** Module 1 will formalize these; kept loose here so Stage 2 doesn't preempt it. */
export type UserType = 'customer' | 'organization' | 'tenant' | 'staff';

export interface PortalAccess {
  userType: UserType;
  roles: string[];
  /** May reach admin.* — staff type, OR holds any admin role, OR allowlisted. */
  isStaff: boolean;
}

export interface PublicMetadataShape {
  userType?: UserType;
  roles?: string[];
}

/**
 * Parse a comma/whitespace-separated allowlist env string into lowercased emails.
 * (`STAFF_ALLOWLIST_EMAILS` — bootstrap only; removed once Module 1's role UI
 * is the source of truth.)
 */
export function parseStaffAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Paths a TENANT may reach on play.* — the read-only schedule and the auth
 * pages middleware already exempts. Everything else redirects to /schedule
 * (Module 1: "read-only access to the facility schedule and nothing else").
 */
export function tenantAllowedPath(pathname: string): boolean {
  return (
    pathname === '/schedule' ||
    pathname.startsWith('/schedule/') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')
  );
}

export function resolveAccess(input: {
  email?: string | null;
  metadata?: PublicMetadataShape | null;
  staffAllowlist?: string[];
}): PortalAccess {
  const metadata = input.metadata ?? {};
  const userType: UserType = metadata.userType ?? 'customer';
  const roles = Array.isArray(metadata.roles) ? metadata.roles.filter(Boolean) : [];

  const email = (input.email ?? '').toLowerCase();
  const allowlisted = !!email && (input.staffAllowlist ?? []).includes(email);

  // A customer who holds an admin role (e.g. a parent who volunteers as Coach)
  // gets admin.* access for that role's scope — base type stays customer.
  const isStaff = userType === 'staff' || roles.length > 0 || allowlisted;

  return { userType, roles, isStaff };
}
