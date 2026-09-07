import 'server-only';
import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { audit, parseStaffAllowlist, resolveAccess, type PortalAccess } from '@ai/foundation';
import { profileCan } from '@/lib/access/capabilities';
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
  /**
   * Email is on STAFF_ALLOWLIST_EMAILS — the bootstrap root that exists so the
   * first admins can reach admin.* and seed roles with zero setup. Passes every
   * capability check; retire the env var once the Admin role is populated.
   */
  bootstrapAdmin: boolean;
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
  bootstrapAdmin: false,
};

/**
 * The pure-ish core, separated from Clerk session retrieval so the dev verify
 * route can exercise every user-type path with synthetic profiles.
 */
export async function accessForProfile(profile: Profile): Promise<{
  access: PortalAccess;
  profile: Profile;
  allowlisted: boolean;
}> {
  const staffAllowlist = parseStaffAllowlist(process.env.STAFF_ALLOWLIST_EMAILS);

  // A suspended or archived account keeps its rows but loses every privilege:
  // no admin.* access, no allowlist promotion. Offboarding = archive.
  if (profile.status !== 'active') {
    const roles = await getRoleNames(profile.id);
    return {
      access: { userType: profile.user_type, roles, isStaff: false },
      profile,
      allowlisted: false,
    };
  }

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
  return { access, profile: effective, allowlisted };
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

  const { access, profile, allowlisted } = await accessForProfile(await getOrCreateProfile());
  return {
    userId,
    email: profile.email,
    profileId: profile.id,
    familyId: profile.family_id,
    status: profile.status,
    ...access,
    canTransact: profile.status === 'active' && profile.user_type !== 'tenant',
    bootstrapAdmin: allowlisted && access.isStaff,
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
 * A signed-in account that may transact — register, book, manage the
 * household. Tenants (read-only schedule) and suspended/archived accounts are
 * refused here even though they can still sign in; use `requireFamily()` for
 * the operations they must keep (paying a balance).
 */
export async function requireCustomer(): Promise<SignedInSession> {
  const session = await requireSignedIn();
  if (!session.canTransact) {
    throw new AuthError(
      session.userType === 'tenant'
        ? 'Tenant accounts have read-only access to the schedule.'
        : 'This account is suspended. Contact us to restore it.',
    );
  }
  return session;
}

/** A signed-in account with a household (familyId narrowed). Suspended accounts pass — they must be able to pay. */
export async function requireFamily(): Promise<SignedInSession & { familyId: number }> {
  const session = await requireSignedIn();
  if (session.familyId === null) throw new AuthError('Your account has no household yet — open your account page first.');
  return session as SignedInSession & { familyId: number };
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

/** Does the current staff caller hold `capability` (bootstrap admins always do)? */
export async function hasStaffCapability(capability: string, mode: 'view' | 'edit' = 'view'): Promise<boolean> {
  const session = await getPortalSession();
  if (!isSignedIn(session) || !session.isStaff) return false;
  if (session.bootstrapAdmin) return true;
  return profileCan(session.profileId, capability, mode);
}

/**
 * Staff gate PLUS a Module 5 capability check (role matrix). Use for the
 * sensitive operations: pay, score entry, camp check-in, roster PII, and the
 * security root `manage_roles` for anything that changes who can do what.
 */
export async function requireStaffCapability(
  capability: string,
  mode: 'view' | 'edit' = 'edit',
  message?: string,
): Promise<StaffSession> {
  const session = await requireStaff();
  if (session.bootstrapAdmin) return session;
  if (!(await profileCan(session.profileId, capability, mode))) {
    throw new AuthError(message ?? `You lack the ${capability.replace(/_/g, ' ')} capability.`);
  }
  return session;
}
