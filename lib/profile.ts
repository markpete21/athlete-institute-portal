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

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .upsert(
      {
        clerk_user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? null,
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
