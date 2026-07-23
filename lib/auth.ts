import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { audit, parseStaffAllowlist, resolveAccess, type PortalAccess } from '@ai/foundation';
import { getOrCreateProfile, getRoleNames, promoteToStaff, type Profile } from '@/lib/profile';

/**
 * Server-side auth for the portal — DB-backed as of Module 1 Stage 2. The
 * *policy* (who counts as staff) stays in `@ai/foundation` resolveAccess();
 * this module now feeds it the profiles/role_assignments truth instead of
 * Clerk metadata. STAFF_ALLOWLIST_EMAILS remains as bootstrap only, and any
 * allowlisted sign-in is converged into the DB via an audited staff promotion.
 */

export interface PortalSession extends PortalAccess {
  userId: string | null;
  email: string | null;
  profileId: number | null;
  familyId: number | null;
  /** Account lifecycle — suspended/archived cannot register or transact. */
  status: Profile['status'] | null;
  /** Convenience: active account that may transact (register/pay). */
  canTransact: boolean;
}

const SIGNED_OUT: PortalSession = {
  userId: null,
  email: null,
  profileId: null,
  familyId: null,
  status: null,
  userType: 'customer',
  roles: [],
  isStaff: false,
  canTransact: false,
};

/**
 * The pure-ish core, separated from Clerk session retrieval so the dev verify
 * route can exercise every user-type path with synthetic profiles.
 */
export async function accessForProfile(profile: Profile): Promise<{
  access: PortalAccess;
  profile: Profile;
}> {
  const staffAllowlist = parseStaffAllowlist(process.env.STAFF_ALLOWLIST_EMAILS);

  // Bootstrap convergence: allowlisted customer → staff in the DB (audited).
  let effective = profile;
  const allowlisted = !!profile.email && staffAllowlist.includes(profile.email.toLowerCase());
  if (allowlisted && profile.user_type === 'customer') {
    effective = await promoteToStaff(profile);
    await audit({
      actorId: 'system:staff-allowlist',
      action: 'profile.staff-promoted',
      target: `profile:${profile.id}`,
      meta: { email: profile.email },
    });
  }

  const roles = await getRoleNames(effective.id);
  const access = resolveAccess({
    email: effective.email,
    metadata: { userType: effective.user_type, roles },
    staffAllowlist,
  });
  return { access, profile: effective };
}

/** Resolve the current user's portal session. Returns a signed-out shell if none. */
export async function getPortalSession(): Promise<PortalSession> {
  const { userId } = await auth();
  if (!userId) return SIGNED_OUT;

  const { access, profile } = await accessForProfile(await getOrCreateProfile());
  return {
    userId,
    email: profile.email,
    profileId: profile.id,
    familyId: profile.family_id,
    status: profile.status,
    ...access,
    canTransact: profile.status === 'active' && profile.user_type !== 'tenant',
  };
}

/** True if the current user may reach admin.* (staff type, any role, or allowlisted). */
export async function isStaff(): Promise<boolean> {
  return (await getPortalSession()).isStaff;
}
