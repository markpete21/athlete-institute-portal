import 'server-only';
import { audit, currentSeason, type Season } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Staff season credits + Play Points (Module 1 Stage 4).
 *
 * Credit semantics (spec): fixed seasons Jan–Apr / May–Aug / Sep–Dec; at each
 * season start the balance TOPS UP TO the cap (leftover $30 on a $100 cap →
 * $100, not $130; unused credit never rolls over). Cap = the portal default
 * unless the account has an override. Spendable across the whole household.
 *
 * Points: 100 points = $1 (1 point = 1 cent), household-level, atomic via the
 * play_points_apply RPC (migration 0003).
 */

export const seasonKeyOf = (s: Season) => `${s.year}:${s.key}`;

export interface StaffCreditState {
  profileId: number;
  capCents: number;
  balanceCents: number;
  seasonKey: string;
  toppedUp: boolean;
}

/** The portal-wide default cap (admin-editable in portal_settings). */
export async function getDefaultCreditCapCents(): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('portal_settings')
    .select('value')
    .eq('key', 'staff_credit_default_cap_cents')
    .maybeSingle();
  if (error) throw new Error(`default cap read failed: ${error.message}`);
  const v = Number(data?.value ?? 0);
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

/**
 * The staff member's credit account for the CURRENT season, creating it or
 * topping it up to the cap when the season has rolled over.
 */
export async function ensureSeasonCredit(profileId: number): Promise<StaffCreditState> {
  const db = supabaseAdmin();
  const season = seasonKeyOf(currentSeason());
  const defaultCap = await getDefaultCreditCapCents();

  const { data: existing, error } = await db
    .from('staff_credit_accounts')
    .select('profile_id, cap_override_cents, balance_cents, season_key')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(`credit account read failed: ${error.message}`);

  const capCents = existing?.cap_override_cents ?? defaultCap;

  if (!existing) {
    const { error: e2 } = await db
      .from('staff_credit_accounts')
      .insert({ profile_id: profileId, balance_cents: capCents, season_key: season });
    if (e2) throw new Error(`credit account create failed: ${e2.message}`);
    await audit({
      actorId: 'system:season-topup',
      action: 'staff_credit.opened',
      target: `profile:${profileId}`,
      meta: { season, cap_cents: capCents },
    });
    return { profileId, capCents, balanceCents: capCents, seasonKey: season, toppedUp: true };
  }

  if (existing.season_key !== season) {
    // Season rollover: balance := cap (TO the cap, not += cap; no rollover).
    const { error: e3 } = await db
      .from('staff_credit_accounts')
      .update({ balance_cents: capCents, season_key: season })
      .eq('profile_id', profileId);
    if (e3) throw new Error(`season top-up failed: ${e3.message}`);
    await audit({
      actorId: 'system:season-topup',
      action: 'staff_credit.topped-up',
      target: `profile:${profileId}`,
      meta: { season, cap_cents: capCents, previous_balance: existing.balance_cents, previous_season: existing.season_key },
    });
    return { profileId, capCents, balanceCents: capCents, seasonKey: season, toppedUp: true };
  }

  return { profileId, capCents, balanceCents: existing.balance_cents, seasonKey: season, toppedUp: false };
}

/** Set or clear a per-account cap override (admin action; audited by caller). */
export async function setCreditCapOverride(profileId: number, capCents: number | null): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('staff_credit_accounts')
    .update({ cap_override_cents: capCents })
    .eq('profile_id', profileId);
  if (error) throw new Error(`cap override failed: ${error.message}`);
}

/** Spend staff credit atomically (raises on insufficient funds). */
export async function spendStaffCredit(profileId: number, amountCents: number, actorClerkId: string, ref?: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('staff_credit_spend', {
    p_profile_id: profileId,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error(`staff credit spend failed: ${error.message}`);
  await audit({
    actorId: actorClerkId,
    action: 'staff_credit.spent',
    target: `profile:${profileId}`,
    meta: { amount_cents: amountCents, new_balance: data, ref },
  });
  return data as number;
}

/** Earn (+) or spend (−) Play Points atomically. Returns the new balance. */
export async function applyPlayPoints(
  familyId: number,
  deltaPoints: number,
  reason: string,
  actorClerkId: string,
  ref?: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('play_points_apply', {
    p_family_id: familyId,
    p_delta: deltaPoints,
    p_reason: reason,
    p_ref: ref ?? null,
    p_created_by: actorClerkId,
  });
  if (error) throw new Error(`play points apply failed: ${error.message}`);
  return data as number;
}
