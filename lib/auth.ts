import 'server-only';
import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { audit, parseStaffAllowlist, resolveAccess, type PortalAccess } from '@ai/foundation';
import { getOrCreateProfile, getRoleNames, promoteToStaff, type Profile } from '@/lib/profile';

/**
 * Server-side auth for the portal — DB-backed as of Module 1 Stage 2. The
 * *policy* (who counts as staff) stays in `@ai/foundation` resolveAccess();
 * this module now feeds it the profiles/role_assignments truth instead of
 * Clerk metadata. STAFF_ALLOWLIST_EMAILS remains as bootstrap only, and any
 * allowlisted sign-in is converged into the DB via an audited staff promotion.
 *
 * Every guard below is the ONE place its rule lives. Server actions and route
 * handlers call `requireStaff()` / `requireSignedIn()` /
 * `requireStaffCapability()` instead of re-deriving the check locally, so a
 * policy change (e.g. per-brand staff scoping) is a one-file edit.
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

/** A session that is guaranteed signed in: the nullable identity fields are narrowed. */
export interface SignedInSession extends PortalSession {
  userId: string;
  profileId: number;
  status: Profile['status'];
}

/** A signed-in session that has passed the staff gate. */
export interface StaffSession extends SignedInSession {
  isStaff: true;
}

/** Thrown by the guards; server actions surface `.message` to the UI. */
export class AuthError extends Error {
  constructor(message: string, readonly code: 'signed_out' | 'forbidden' = 'forbidden') {
    super(message);
    this.name = 'AuthError';
  }
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

/**
 * Resolve the current user's portal session. Returns a signed-out shell if none.
 *
 * Memoised per request with React `cache()`: the layout, the page, and any
 * server action invoked in the same request all share ONE Clerk lookup + ONE
 * profile mirror + ONE roles read, instead of repeating the three round-trips
 * at every call site.
 */
export const getPortalSession = cache(async (): Promise<PortalSession> => {
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
});

/** True if the current user may reach admin.* (staff type, any role, or allowlisted). */
export async function isStaff(): Promise<boolean> {
  return (await getPortalSession()).isStaff;
}

function isSignedIn(s: PortalSession): s is SignedInSession {
  return s.userId !== null && s.profileId !== null;
}

/** The current session, or throw if nobody is signed in. */
export async function requireSignedIn(message = 'Sign in first.'): Promise<SignedInSession> {
  const session = await getPortalSession();
  if (!isSignedIn(session)) throw new AuthError(message, 'signed_out');
  return session;
}

/**
 * The current session, or throw unless the caller is staff. Every admin server
 * action starts with this — the admin layout already blocks the UI, this
 * defends the action itself against a direct invocation.
 */
export async function requireStaff(): Promise<StaffSession> {
  const session = await getPortalSession();
  if (!isSignedIn(session)) throw new AuthError('Sign in first.', 'signed_out');
  if (!session.isStaff) throw new AuthError('Staff only.');
  return session as StaffSession;
}

/**
 * Staff gate PLUS a Module 5 capability check (role matrix). Use for the
 * sensitive operations: pay, score entry, camp check-in, roster PII…
 */
export async function requireStaffCapability(
  capability: string,
  mode: 'view' | 'edit' = 'edit',
  message?: string,
): Promise<StaffSession> {
  const session = await requireStaff();
  const { profileCan } = await import('@/lib/staff/staff');
  if (!(await profileCan(session.profileId, capability, mode))) {
    throw new AuthError(message ?? `You lack the ${capability.replace(/_/g, ' ')} capability.`);
  }
  return session;
}
