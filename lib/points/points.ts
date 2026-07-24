import 'server-only';
import { randomBytes } from 'node:crypto';
import { POINTS_EXCLUDED_PROGRAM_TYPES, audit, currentSeason } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { applyPlayPoints } from '@/lib/credits';
import { fireTrigger } from '@/lib/comms/notifications';

/**
 * Play Points & Referrals (Module 19). The ledger, household tracking, and the
 * 100pts=$1 redemption slot (50% cap, programs only) already live in Module 1's
 * pricing function - this module adds the configurable EARN-rule engine, the
 * two-sided referral system, the loyalty ladder, and reporting.
 *
 * DISCLAIMER (shown wherever points appear): points are earned on PROGRAMS
 * only and cannot be earned or redeemed on Academy, Club, or rentals.
 */

export const POINTS_DISCLAIMER =
  'Play Points are earned on program registrations only and are not earned or redeemable on Academy, Club, or facility rentals. 100 points = $1. Points never expire.';

export const REFERRAL_SEASON_CAP = 3;
export const LOYALTY_LADDER: Array<{ seasons: number; points: number }> = [
  { seasons: 3, points: 500 },
  { seasons: 5, points: 1000 },
  { seasons: 7, points: 1500 },
  { seasons: 10, points: 2500 },
];

// --- earn-rule engine ---------------------------------------------------------

export interface EarnRule { rule_key: string; label: string; points: number; enabled: boolean; per_household_once: boolean }

export async function earnRules(): Promise<EarnRule[]> {
  const { data } = await supabaseAdmin().from('points_earn_rules').select('*').order('rule_key');
  return (data ?? []) as EarnRule[];
}

export async function updateEarnRule(ruleKey: string, patch: { enabled?: boolean; points?: number }, actorClerkId: string): Promise<void> {
  await supabaseAdmin().from('points_earn_rules').update({ ...patch, updated_by: actorClerkId, updated_at: new Date().toISOString() }).eq('rule_key', ruleKey);
  await audit({ actorId: actorClerkId, action: 'points.rule-updated', target: `rule:${ruleKey}`, meta: patch });
}

async function notifyEarned(familyId: number, points: number, message: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: fam } = await db.from('families').select('hoh_profile_id, play_points_balance').eq('id', familyId).maybeSingle();
  if (!fam?.hoh_profile_id) return;
  const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).maybeSingle();
  if (prof?.email) await fireTrigger('points.earned', { email: prof.email }, { points, message, balance: fam.play_points_balance ?? 0 });
}

/**
 * Award a configured earn rule to a household. Respects the on/off toggle, the
 * configured value, and per-household one-time enforcement (checked against the
 * ledger by reason). Returns points awarded (0 = disabled/already earned).
 */
export async function awardRule(ruleKey: string, familyId: number, opts: { actorClerkId?: string; message?: string; refSuffix?: string } = {}): Promise<number> {
  const db = supabaseAdmin();
  const { data: rule } = await db.from('points_earn_rules').select('*').eq('rule_key', ruleKey).maybeSingle();
  if (!rule || !rule.enabled || rule.points <= 0) return 0;

  if (rule.per_household_once) {
    const { count } = await db.from('play_points_ledger').select('id', { count: 'exact', head: true }).eq('family_id', familyId).eq('reason', ruleKey);
    if ((count ?? 0) > 0) return 0;
  }

  await applyPlayPoints(familyId, rule.points, ruleKey, opts.actorClerkId ?? 'system:points', opts.refSuffix);
  await notifyEarned(familyId, rule.points, opts.message ?? `You earned ${rule.points} Play Points - ${rule.label}.`);
  return rule.points;
}

/** Staff manual grant/adjustment - REASON REQUIRED, permission-gated by caller. */
export async function manualGrant(familyId: number, points: number, reason: string, actorClerkId: string): Promise<void> {
  if (!reason.trim()) throw new Error('A reason is required for manual point grants.');
  await applyPlayPoints(familyId, points, `manual: ${reason.trim()}`, actorClerkId);
  await audit({ actorId: actorClerkId, action: 'points.manual-grant', target: `family:${familyId}`, meta: { points, reason } });
}

// --- loyalty ladder -------------------------------------------------------------

/**
 * Distinct seasons a household has participated in. Club + Academy seasons
 * COUNT; rentals never do (they aren't registrations). Milestones are one-time.
 */
export async function loyaltySeasons(familyId: number): Promise<number> {
  const { data } = await supabaseAdmin()
    .from('registrations')
    .select('programs(season_key)')
    .eq('family_id', familyId)
    .in('status', ['active', 'withdrawn']);
  const seasons = new Set((data ?? []).map((r) => (r.programs as unknown as { season_key: string | null } | null)?.season_key).filter(Boolean));
  return seasons.size;
}

/** Award any newly-reached loyalty milestones (each once per household). */
export async function awardLoyaltyMilestones(familyId: number): Promise<number> {
  const db = supabaseAdmin();
  const seasons = await loyaltySeasons(familyId);
  let awarded = 0;
  for (const step of LOYALTY_LADDER) {
    if (seasons < step.seasons) continue;
    const reason = `loyalty.${step.seasons}-seasons`;
    const { count } = await db.from('play_points_ledger').select('id', { count: 'exact', head: true }).eq('family_id', familyId).eq('reason', reason);
    if ((count ?? 0) > 0) continue;
    await applyPlayPoints(familyId, step.points, reason, 'system:points');
    await notifyEarned(familyId, step.points, `You hit ${step.seasons} seasons with us - ${step.points} Play Points!`);
    awarded += step.points;
  }
  return awarded;
}

// --- referrals -----------------------------------------------------------------

export async function getOrCreateReferralCode(familyId: number): Promise<string> {
  const db = supabaseAdmin();
  const { data: fam } = await db.from('families').select('referral_code').eq('id', familyId).single();
  if (fam?.referral_code) return fam.referral_code;
  const code = randomBytes(6).toString('base64url');
  await db.from('families').update({ referral_code: code }).eq('id', familyId);
  return code;
}

/** Link a new household to its referrer (at signup). Rewards wait for first PAID registration. */
export async function recordReferral(referralCode: string, referredFamilyId: number): Promise<{ recorded: boolean; reason?: string }> {
  const db = supabaseAdmin();
  const { data: referrer } = await db.from('families').select('id').eq('referral_code', referralCode).maybeSingle();
  if (!referrer) return { recorded: false, reason: 'unknown code' };
  if (referrer.id === referredFamilyId) return { recorded: false, reason: 'same household' };
  const { error } = await db.from('referrals').insert({ referrer_family_id: referrer.id, referred_family_id: referredFamilyId, season_key: seasonKeyNow() });
  if (error) return { recorded: false, reason: 'already referred' };
  return { recorded: true };
}

function seasonKeyNow(): string {
  const s = currentSeason();
  return `${s.year}:${s.key}`;
}

/**
 * THE reward trigger: fires when the referred household completes its FIRST
 * PAID registration (account creation alone is gameable). Referrer +1000 /
 * referred +500, capped at 3 successful referrals per referrer per season.
 * Beyond the cap the referral stays pending (staff can still reward manually).
 */
export async function onFirstPaidRegistration(referredFamilyId: number): Promise<{ rewarded: boolean; reason?: string }> {
  const db = supabaseAdmin();
  const { data: ref } = await db.from('referrals').select('id, referrer_family_id, season_key, status').eq('referred_family_id', referredFamilyId).eq('status', 'pending').maybeSingle();
  if (!ref) return { rewarded: false, reason: 'no pending referral' };

  // Season cap per referrer.
  const { count: rewardedThisSeason } = await db
    .from('referrals').select('id', { count: 'exact', head: true })
    .eq('referrer_family_id', ref.referrer_family_id).eq('season_key', ref.season_key).eq('status', 'rewarded');
  if ((rewardedThisSeason ?? 0) >= REFERRAL_SEASON_CAP) return { rewarded: false, reason: 'season cap reached' };

  const referrerPts = await awardRule('referral.referrer', ref.referrer_family_id, { message: 'You earned Play Points - your friend just made their first registration!', refSuffix: `referral:${ref.id}` });
  const referredPts = await awardRule('referral.referred', referredFamilyId, { message: 'Welcome bonus - thanks for joining through a friend!', refSuffix: `referral:${ref.id}` });
  await db.from('referrals').update({ status: 'rewarded', rewarded_at: new Date().toISOString() }).eq('id', ref.id);
  await audit({ actorId: 'system:points', action: 'referral.rewarded', target: `referral:${ref.id}`, meta: { referrerPts, referredPts } });
  return { rewarded: true };
}

/** Flag a referral as suspicious (flag-not-block; staff review). */
export async function flagReferral(referralId: number, reason: string, actorClerkId: string): Promise<void> {
  await supabaseAdmin().from('referrals').update({ status: 'flagged', flag_reason: reason }).eq('id', referralId);
  await audit({ actorId: actorClerkId, action: 'referral.flagged', target: `referral:${referralId}`, meta: { reason } });
}

/** Claw back fraudulent referral points (reason logged, both sides reversed). */
export async function clawBackReferral(referralId: number, reason: string, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: ref } = await db.from('referrals').select('referrer_family_id, referred_family_id, status').eq('id', referralId).single();
  if (!ref) throw new Error('Referral not found.');
  if (ref.status === 'rewarded') {
    const { data: rules } = await db.from('points_earn_rules').select('rule_key, points').in('rule_key', ['referral.referrer', 'referral.referred']);
    const val = (k: string) => rules?.find((r) => r.rule_key === k)?.points ?? 0;
    await applyPlayPoints(ref.referrer_family_id, -val('referral.referrer'), `clawback: ${reason}`, actorClerkId, `referral:${referralId}`);
    await applyPlayPoints(ref.referred_family_id, -val('referral.referred'), `clawback: ${reason}`, actorClerkId, `referral:${referralId}`);
  }
  await db.from('referrals').update({ status: 'clawed_back', flag_reason: reason }).eq('id', referralId);
  await audit({ actorId: actorClerkId, action: 'referral.clawed-back', target: `referral:${referralId}`, meta: { reason } });
}

// --- customer surface + reporting ------------------------------------------------

export interface PointsSurface {
  balance: number;
  ledger: Array<{ delta: number; reason: string; createdAt: string }>;
  referralCode: string;
  referralsThisSeason: number;
  referralCap: number;
  loyaltySeasons: number;
  nextMilestone: { seasons: number; points: number } | null;
  disclaimer: string;
}

export async function pointsSurface(familyId: number): Promise<PointsSurface> {
  const db = supabaseAdmin();
  const [{ data: fam }, { data: ledger }, code, seasons] = await Promise.all([
    db.from('families').select('play_points_balance').eq('id', familyId).single(),
    db.from('play_points_ledger').select('delta_points, reason, created_at').eq('family_id', familyId).order('id', { ascending: false }).limit(50),
    getOrCreateReferralCode(familyId),
    loyaltySeasons(familyId),
  ]);
  const { count: refs } = await db.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_family_id', familyId).eq('season_key', seasonKeyNow()).eq('status', 'rewarded');
  return {
    balance: fam?.play_points_balance ?? 0,
    ledger: (ledger ?? []).map((l) => ({ delta: l.delta_points, reason: l.reason, createdAt: l.created_at })),
    referralCode: code,
    referralsThisSeason: refs ?? 0,
    referralCap: REFERRAL_SEASON_CAP,
    loyaltySeasons: seasons,
    nextMilestone: LOYALTY_LADDER.find((s) => seasons < s.seasons) ?? null,
    disclaimer: POINTS_DISCLAIMER,
  };
}

export interface PointsReport {
  liabilityPoints: number;
  liabilityCents: number;   // 100 pts = $1 -> 1 pt = 1 cent
  earnedTotal: number;
  redeemedTotal: number;
  referralConversion: { recorded: number; rewarded: number; rate: number };
  topReferrers: Array<{ familyName: string; rewarded: number }>;
}

/** Points liability + trends + referral conversion (feeds M14; staff-only). */
export async function pointsReport(): Promise<PointsReport> {
  const db = supabaseAdmin();
  const { data: fams } = await db.from('families').select('play_points_balance');
  const liabilityPoints = (fams ?? []).reduce((a, f) => a + (f.play_points_balance ?? 0), 0);
  const { data: ledger } = await db.from('play_points_ledger').select('delta_points');
  let earnedTotal = 0, redeemedTotal = 0;
  for (const l of ledger ?? []) {
    if (l.delta_points > 0) earnedTotal += l.delta_points;
    else redeemedTotal += -l.delta_points;
  }
  const { count: recorded } = await db.from('referrals').select('id', { count: 'exact', head: true });
  const { count: rewarded } = await db.from('referrals').select('id', { count: 'exact', head: true }).eq('status', 'rewarded');
  const { data: top } = await db.from('referrals').select('referrer_family_id, families!referrals_referrer_family_id_fkey(name)').eq('status', 'rewarded');
  const byRef = new Map<string, number>();
  for (const t of top ?? []) {
    const name = (t.families as unknown as { name: string } | null)?.name ?? `family ${t.referrer_family_id}`;
    byRef.set(name, (byRef.get(name) ?? 0) + 1);
  }
  return {
    liabilityPoints,
    liabilityCents: liabilityPoints, // 1 pt = 1 cent
    earnedTotal,
    redeemedTotal,
    referralConversion: { recorded: recorded ?? 0, rewarded: rewarded ?? 0, rate: recorded ? (rewarded ?? 0) / recorded : 0 },
    topReferrers: [...byRef.entries()].map(([familyName, rewardedCount]) => ({ familyName, rewarded: rewardedCount })).sort((a, b) => b.rewarded - a.rewarded).slice(0, 10),
  };
}

export { POINTS_EXCLUDED_PROGRAM_TYPES };
