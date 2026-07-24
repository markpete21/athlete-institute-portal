import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Clerk → profiles mirroring (Module 1 Stage 1). Clerk owns identity; the
 * `profiles` row is the relational anchor every table FKs to. get-or-create is
 * idempotent on clerk_user_id, and refreshes email/name drift on every call
 * (cheap single upsert).
 */

export interface Profile {
  id: number;
  clerk_user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  user_type: 'customer' | 'organization' | 'tenant' | 'staff';
  status: 'active' | 'suspended' | 'archived';
  settings: Record<string, unknown>;
  family_id: number | null;
}

const COLS = 'id, clerk_user_id, email, first_name, last_name, user_type, status, settings, family_id';

/** Mirror the signed-in Clerk user into profiles and return the row. */
export async function getOrCreateProfile(): Promise<Profile> {
  const user = await currentUser();
  if (!user) throw new Error('getOrCreateProfile(): no signed-in user');

  // Claim flow (Module 1 Stage 5): a first sign-in whose email matches an
  // imported-but-unclaimed profile ADOPTS it (keeps family links) instead of
  // creating a duplicate.
  const email = user.primaryEmailAddress?.emailAddress;
  const emailVerified = user.primaryEmailAddress?.verification?.status === 'verified';
  const db = supabaseAdmin();
  const { data: known } = await db
    .from('profiles')
    .select('id')
    .eq('clerk_user_id', user.id)
    .maybeSingle();

  if (!known && email) {
    // Claim flow: adopt an imported-but-unclaimed profile with this email.
    const { adoptUnclaimedProfile } = await import('@/lib/import/playbook');
    await adoptUnclaimedProfile(user.id, email);

    // Re-link flow: a profile may already exist for this VERIFIED email under a
    // different clerk_user_id - e.g. the dev→prod Clerk instance switch, or a
    // returning user who re-signed-up. `profiles.email` is unique, so a plain
    // insert would 500; the same verified email is the same person, so adopt
    // that row (Clerk verifies primary-email ownership). Unverified emails are
    // never re-linked (guards against email-squatting).
    if (emailVerified) {
      const { data: byEmail } = await db
        .from('profiles')
        .select('id, clerk_user_id')
        .ilike('email', email)
        .neq('clerk_user_id', user.id)
        .maybeSingle();
      if (byEmail) {
        await db.from('profiles').update({ clerk_user_id: user.id }).eq('id', byEmail.id);
      }
    }
  }

  const { data, error } = await db
    .from('profiles')
    .upsert(
      {
        clerk_user_id: user.id,
        email: email ?? null,
        first_name: user.firstName,
        last_name: user.lastName,
      },
      { onConflict: 'clerk_user_id' },
    )
    .select(COLS)
    .single();

  if (error) throw new Error(`profiles upsert failed: ${error.message}`);
  return data as Profile;
}

/** Fetch a profile by Clerk user id (null if the user has never signed in). */
export async function getProfileByClerkId(clerkUserId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select(COLS)
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`profiles read failed: ${error.message}`);
  return (data as Profile) ?? null;
}

/** Role names assigned to a profile (empty array = no admin roles). */
export async function getRoleNames(profileId: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from('role_assignments')
    .select('roles(name)')
    .eq('profile_id', profileId);
  if (error) throw new Error(`role_assignments read failed: ${error.message}`);
  return (data ?? [])
    .map((r) => (r.roles as unknown as { name: string } | null)?.name)
    .filter((n): n is string => !!n);
}

/**
 * Bootstrap promotion: an allowlisted email signing in as a plain customer is
 * converted to staff in the DB (audited). Makes the database converge to the
 * truth the STAFF_ALLOWLIST_EMAILS bootstrap asserts, so the allowlist can be
 * retired once Module 1's role UI manages staff directly.
 */
export async function promoteToStaff(profile: Profile): Promise<Profile> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .update({ user_type: 'staff' })
    .eq('id', profile.id)
    .select(COLS)
    .single();
  if (error) throw new Error(`staff promotion failed: ${error.message}`);
  return data as Profile;
}
