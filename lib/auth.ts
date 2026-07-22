import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import {
  resolveAccess,
  parseStaffAllowlist,
  type PortalAccess,
  type PublicMetadataShape,
} from '@ai/foundation';

/**
 * Server-side auth for the portal. The *policy* (who counts as staff) lives in
 * `@ai/foundation` (pure, testable); this module supplies the Clerk data to it.
 *
 * Stage 2 reads roles/type from Clerk publicMetadata + the STAFF_ALLOWLIST_EMAILS
 * bootstrap. Module 1 swaps the data source to the Supabase role model without
 * changing these signatures.
 */

export interface PortalSession extends PortalAccess {
  userId: string | null;
  email: string | null;
}

/** Resolve the current user's portal access. Returns a signed-out shell if none. */
export async function getPortalSession(): Promise<PortalSession> {
  const { userId } = await auth();
  if (!userId) {
    return { userId: null, email: null, userType: 'customer', roles: [], isStaff: false };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const metadata = (user?.publicMetadata ?? {}) as PublicMetadataShape;
  const staffAllowlist = parseStaffAllowlist(process.env.STAFF_ALLOWLIST_EMAILS);

  const access = resolveAccess({ email, metadata, staffAllowlist });
  return { userId, email, ...access };
}

/** True if the current user may reach admin.* (staff type, any role, or allowlisted). */
export async function isStaff(): Promise<boolean> {
  return (await getPortalSession()).isStaff;
}
