import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Staff account merge (Accounts review). Folds a duplicate profile — and its
 * household, when it has one of its own — into a surviving target account.
 * Everything re-points to the target: members, registrations, orders,
 * ledgers, balances, roles, signatures. The source profile is archived with a
 * `merged_into` pointer that getOrCreateProfile() follows, so if the source
 * was a real login it keeps working and lands on the merged account.
 *
 * ⚠️ Table lists below are explicit — when a new table gains a family_id or
 * profile_id column, add it here (grep: "references public.families" /
 * "references public.profiles" in supabase/migrations).
 */

/** Tables carrying family_id that must follow a family merge. */
const FAMILY_REF_TABLES: Array<{ table: string; col: string }> = [
  { table: 'play_points_ledger', col: 'family_id' },
  { table: 'credit_ledger', col: 'family_id' },
  { table: 'registrations', col: 'family_id' },
  { table: 'program_orders', col: 'family_id' },
  { table: 'bookings', col: 'family_id' },
  { table: 'rentals', col: 'family_id' },
  { table: 'academy_players', col: 'family_id' },
  { table: 'club_tryout_players', col: 'family_id' },
  { table: 'dunning_cases', col: 'family_id' },
  { table: 'feedback_responses', col: 'family_id' },
  { table: 'retention_flags', col: 'family_id' },
  { table: 'registration_flow_events', col: 'family_id' },
  { table: 'calendar_feeds', col: 'family_id' },
  { table: 'contest_scores', col: 'family_id' },
  { table: 'wheel_spins', col: 'family_id' },
  { table: 'challenge_progress', col: 'family_id' },
  { table: 'family_badges', col: 'family_id' },
  { table: 'referrals', col: 'referrer_family_id' },
  { table: 'referrals', col: 'referred_family_id' },
];

/** Tables carrying profile_id that must follow a profile merge. */
const PROFILE_REF_TABLES: Array<{ table: string; col: string }> = [
  { table: 'family_members', col: 'profile_id' },
  { table: 'families', col: 'hoh_profile_id' },
  { table: 'role_assignments', col: 'profile_id' },
  { table: 'staff_credit_accounts', col: 'profile_id' },
  { table: 'staff', col: 'profile_id' },
  { table: 'program_staff', col: 'profile_id' },
  { table: 'registrations', col: 'profile_id' },
  { table: 'program_orders', col: 'profile_id' },
  { table: 'carts', col: 'owner_profile_id' },
  { table: 'waiver_signatures', col: 'signer_profile_id' },
  { table: 'comms_recipients', col: 'profile_id' },
  { table: 'registration_flow_events', col: 'profile_id' },
  { table: 'rentals', col: 'profile_id' },
  { table: 'organizations', col: 'rep_profile_id' },
  { table: 'admin_nav_prefs', col: 'profile_id' },
];

/**
 * Re-point col from source to target. Unique-constraint collisions (both
 * accounts hold the same role, badge, nav-prefs row, …) resolve by keeping
 * the TARGET's row and dropping the source's.
 */
async function moveRefs(table: string, col: string, sourceId: number, targetId: number): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from(table).update({ [col]: targetId }).eq(col, sourceId);
  if (!error) return;
  if (error.code !== '23505') throw new Error(`merge: ${table}.${col} move failed: ${error.message}`);
  // Unique collision — move what can move (row by row), delete what can't.
  const { data: rows, error: e2 } = await db.from(table).select('*').eq(col, sourceId);
  if (e2) throw new Error(`merge: ${table} re-read failed: ${e2.message}`);
  for (const row of rows ?? []) {
    const { error: e3 } = await db.from(table).update({ [col]: targetId }).eq(col, sourceId).eq('id', (row as { id: number }).id);
    if (e3?.code === '23505') {
      const { error: e4 } = await db.from(table).delete().eq('id', (row as { id: number }).id);
      if (e4) throw new Error(`merge: ${table} dupe cleanup failed: ${e4.message}`);
    } else if (e3) {
      throw new Error(`merge: ${table}.${col} row move failed: ${e3.message}`);
    }
  }
}

export interface MergeResult {
  familyMerged: boolean;
  sourceFamilyId: number | null;
  targetFamilyId: number | null;
}

/** Fold source family into target family (members, money, history, balances). */
async function mergeFamilies(sourceFamilyId: number, targetFamilyId: number, actor: string): Promise<void> {
  const db = supabaseAdmin();

  // Dual-household links: a link into either of the merging families must not
  // end up pointing at the family the member already lives in.
  await db.from('family_members').update({ second_family_id: null })
    .eq('family_id', sourceFamilyId).eq('second_family_id', targetFamilyId);
  await db.from('family_members').update({ second_family_id: null })
    .eq('family_id', targetFamilyId).eq('second_family_id', sourceFamilyId);
  await db.from('family_members').update({ second_family_id: targetFamilyId })
    .eq('second_family_id', sourceFamilyId).neq('family_id', targetFamilyId);
  await db.from('family_members').update({ second_family_id: null })
    .eq('second_family_id', sourceFamilyId);

  // One HoH per family: the source household's head joins as a secondary parent.
  await db.from('family_members').update({ member_role: 'secondary' })
    .eq('family_id', sourceFamilyId).eq('member_role', 'hoh');
  await moveRefs('family_members', 'family_id', sourceFamilyId, targetFamilyId);

  for (const { table, col } of FAMILY_REF_TABLES) {
    await moveRefs(table, col, sourceFamilyId, targetFamilyId);
  }

  // Balances add across (their ledgers moved with them, so totals stay true).
  const { data: src } = await db.from('families')
    .select('play_points_balance, credit_balance_cents').eq('id', sourceFamilyId).single();
  const { data: dst } = await db.from('families')
    .select('play_points_balance, credit_balance_cents').eq('id', targetFamilyId).single();
  if (src && dst) {
    const { error } = await db.from('families').update({
      play_points_balance: (dst.play_points_balance ?? 0) + (src.play_points_balance ?? 0),
      credit_balance_cents: (dst.credit_balance_cents ?? 0) + (src.credit_balance_cents ?? 0),
    }).eq('id', targetFamilyId);
    if (error) throw new Error(`merge: balance transfer failed: ${error.message}`);
  }

  // Anyone signed in against the old household follows it.
  await db.from('profiles').update({ family_id: targetFamilyId }).eq('family_id', sourceFamilyId);

  const { error: delErr } = await db.from('families').delete().eq('id', sourceFamilyId);
  if (delErr) throw new Error(`merge: source family delete failed: ${delErr.message}`);

  await audit({
    actorId: actor,
    action: 'family.merged',
    target: `family:${targetFamilyId}`,
    meta: { source_family_id: sourceFamilyId, points: src?.play_points_balance ?? 0, credit_cents: src?.credit_balance_cents ?? 0 },
  });
}

/**
 * Merge source profile (and its household) into target. Source survives as an
 * archived shell whose settings.merged_into points at the target.
 */
export async function mergeAccounts(sourceProfileId: number, targetProfileId: number, actorClerkId: string): Promise<MergeResult> {
  if (sourceProfileId === targetProfileId) throw new Error('Pick two different accounts.');
  const db = supabaseAdmin();
  const { data: source, error: sErr } = await db.from('profiles').select('*').eq('id', sourceProfileId).single();
  if (sErr) throw new Error(`merge: source read failed: ${sErr.message}`);
  const { data: target, error: tErr } = await db.from('profiles').select('*').eq('id', targetProfileId).single();
  if (tErr) throw new Error(`merge: target read failed: ${tErr.message}`);
  if ((source.settings as Record<string, unknown>)?.merged_into) throw new Error('That account was already merged.');
  if ((target.settings as Record<string, unknown>)?.merged_into) throw new Error('The target account was itself merged — pick its survivor.');

  const sf = source.family_id as number | null;
  const tf = target.family_id as number | null;
  let familyMerged = false;

  if (sf && tf && sf !== tf) {
    await mergeFamilies(sf, tf, actorClerkId);
    familyMerged = true;
  } else if (sf && !tf) {
    // Target has no household — it adopts the source's.
    const { error } = await db.from('profiles').update({ family_id: sf }).eq('id', targetProfileId);
    if (error) throw new Error(`merge: family adopt failed: ${error.message}`);
  }

  for (const { table, col } of PROFILE_REF_TABLES) {
    await moveRefs(table, col, sourceProfileId, targetProfileId);
  }

  // Archive the shell. Email is freed (unique) but remembered; a sign-in on
  // the old Clerk identity follows merged_into (see getOrCreateProfile).
  const { error: shellErr } = await db.from('profiles').update({
    status: 'archived',
    family_id: null,
    claim_token: null,
    email: null,
    settings: {
      ...(source.settings as Record<string, unknown> ?? {}),
      merged_into: targetProfileId,
      merged_email: source.email,
      merged_at: new Date().toISOString(),
    },
  }).eq('id', sourceProfileId);
  if (shellErr) throw new Error(`merge: source archive failed: ${shellErr.message}`);

  await audit({
    actorId: actorClerkId,
    action: 'profile.merged',
    target: `profile:${targetProfileId}`,
    meta: { source_profile_id: sourceProfileId, source_email: source.email, family_merged: familyMerged },
  });

  return { familyMerged, sourceFamilyId: sf, targetFamilyId: tf ?? sf };
}
