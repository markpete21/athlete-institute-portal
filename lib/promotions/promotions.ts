import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { applyPlayPoints } from '@/lib/credits';
import { fireTrigger } from '@/lib/comms/notifications';

/**
 * Promotions & Engagement (Module 20) - the fun layer on Module 19: contests
 * with rotating playable games, the spin-to-win wheel, configurable challenges,
 * and streaks & badges. Every point award flows through the M19/M1 ledger;
 * announcements go out via the M13 templates. No public leaderboards - contest
 * boards are shown only inside the contest window to participants; top-referrer
 * style lists stay staff-facing.
 */

export const GAME_KEYS = ['basketball', 'soccer', 'volleyball', 'pickleball', 'football'] as const;
export type GameKey = (typeof GAME_KEYS)[number];

// --- contests ------------------------------------------------------------------

export async function createContest(input: { name: string; gameKey: GameKey; startsAt: string; endsAt: string; rewardTopN?: number; rewardPoints?: number; announce?: boolean }, actorClerkId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('contests').insert({
    name: input.name.trim(), game_key: input.gameKey, starts_at: input.startsAt, ends_at: input.endsAt,
    reward_top_n: input.rewardTopN ?? 5, reward_points: input.rewardPoints ?? 2500, created_by: actorClerkId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'contest.created', target: `contest:${data.id}`, meta: { game: input.gameKey } });
  if (input.announce) await announceToActiveFamilies(`${input.name} is ON!`, `Play ${input.gameKey} in the portal - top ${input.rewardTopN ?? 5} scores win ${input.rewardPoints ?? 2500} Play Points. Ends ${new Date(input.endsAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}.`);
  return data.id;
}

/** Blast an announcement to every family with an active registration (M13). */
export async function announceToActiveFamilies(title: string, message: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: regs } = await db.from('registrations').select('family_id').eq('status', 'active');
  const familyIds = [...new Set((regs ?? []).map((r) => r.family_id).filter((x): x is number => x != null))];
  let sent = 0;
  for (const familyId of familyIds) {
    const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', familyId).maybeSingle();
    if (!fam?.hoh_profile_id) continue;
    const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).maybeSingle();
    if (!prof?.email) continue;
    await fireTrigger('promo.announcement', { email: prof.email }, { title, message });
    sent += 1;
  }
  return sent;
}

/** Record a game score - enforced to the contest window; best score counts. */
export async function recordScore(contestId: number, familyId: number, score: number): Promise<{ recorded: boolean; reason?: string }> {
  const db = supabaseAdmin();
  const { data: contest } = await db.from('contests').select('starts_at, ends_at, status').eq('id', contestId).single();
  if (!contest) return { recorded: false, reason: 'contest not found' };
  const now = Date.now();
  if (contest.status !== 'open' || now < Date.parse(contest.starts_at) || now > Date.parse(contest.ends_at)) {
    return { recorded: false, reason: 'outside contest window' };
  }
  if (!Number.isInteger(score) || score < 0 || score > 1_000_000) return { recorded: false, reason: 'invalid score' };
  const { error } = await db.from('contest_scores').insert({ contest_id: contestId, family_id: familyId, score });
  if (error) return { recorded: false, reason: error.message };
  return { recorded: true };
}

/** Scoreboard: each family's BEST score, ranked. (Participant-facing during the window.) */
export async function scoreboard(contestId: number): Promise<Array<{ familyId: number; best: number }>> {
  const { data } = await supabaseAdmin().from('contest_scores').select('family_id, score').eq('contest_id', contestId);
  const best = new Map<number, number>();
  for (const s of data ?? []) best.set(s.family_id, Math.max(best.get(s.family_id) ?? 0, s.score));
  return [...best.entries()].map(([familyId, bestScore]) => ({ familyId, best: bestScore })).sort((a, b) => b.best - a.best);
}

/** Close a contest: top-N families auto-awarded via the ledger + notified. */
export async function closeContest(contestId: number, actorClerkId: string): Promise<{ winners: number[] }> {
  const db = supabaseAdmin();
  const { data: contest } = await db.from('contests').select('name, reward_top_n, reward_points, status').eq('id', contestId).single();
  if (!contest) throw new Error('Contest not found.');
  if (contest.status === 'awarded') throw new Error('Contest already awarded.');

  const board = await scoreboard(contestId);
  const winners = board.slice(0, contest.reward_top_n).map((b) => b.familyId);
  for (const familyId of winners) {
    await applyPlayPoints(familyId, contest.reward_points, `contest: ${contest.name}`, actorClerkId, `contest:${contestId}`);
    const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', familyId).maybeSingle();
    if (fam?.hoh_profile_id) {
      const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).maybeSingle();
      if (prof?.email) await fireTrigger('promo.winner', { email: prof.email }, { points: contest.reward_points, message: `You placed in the top ${contest.reward_top_n} of ${contest.name}!` });
    }
  }
  await db.from('contests').update({ status: 'awarded' }).eq('id', contestId);
  await audit({ actorId: actorClerkId, action: 'contest.awarded', target: `contest:${contestId}`, meta: { winners: winners.length, points: contest.reward_points } });
  return { winners };
}

// --- spin-to-win wheel ------------------------------------------------------------

export interface WheelPrize { label: string; points: number; weight: number }

export async function wheelConfig(): Promise<{ prizes: WheelPrize[]; unlockLifetimePoints: number }> {
  const { data } = await supabaseAdmin().from('wheel_config').select('*').eq('id', 1).single();
  return { prizes: (data?.prizes ?? []) as WheelPrize[], unlockLifetimePoints: data?.unlock_lifetime_points ?? 1000 };
}

/** Lifetime points EARNED (positive ledger entries) - the wheel unlock metric. */
export async function lifetimeEarned(familyId: number): Promise<number> {
  const { data } = await supabaseAdmin().from('play_points_ledger').select('delta_points').eq('family_id', familyId).gt('delta_points', 0);
  return (data ?? []).reduce((a, l) => a + l.delta_points, 0);
}

/**
 * Spin the wheel: weighted random prize, logged, points credited via the M19
 * ledger. Unlocked at the configured lifetime-earned milestone (or via a
 * contest/grant source that bypasses the check). rng injectable for tests.
 */
export async function spinWheel(familyId: number, opts: { source?: 'milestone' | 'contest' | 'grant'; rng?: () => number } = {}): Promise<{ prize: WheelPrize } | { locked: true; needed: number }> {
  const db = supabaseAdmin();
  const cfg = await wheelConfig();
  const source = opts.source ?? 'milestone';
  if (source === 'milestone') {
    const earned = await lifetimeEarned(familyId);
    if (earned < cfg.unlockLifetimePoints) return { locked: true, needed: cfg.unlockLifetimePoints - earned };
  }

  const totalWeight = cfg.prizes.reduce((a, p) => a + p.weight, 0);
  let roll = (opts.rng ?? Math.random)() * totalWeight;
  let prize = cfg.prizes[cfg.prizes.length - 1];
  for (const p of cfg.prizes) {
    roll -= p.weight;
    if (roll <= 0) { prize = p; break; }
  }

  await db.from('wheel_spins').insert({ family_id: familyId, prize_label: prize.label, points: prize.points, source });
  if (prize.points > 0) await applyPlayPoints(familyId, prize.points, `wheel: ${prize.label}`, 'system:promotions');
  await audit({ actorId: 'system:promotions', action: 'wheel.spun', target: `family:${familyId}`, meta: { prize: prize.label, source } });
  return { prize };
}

// --- challenges ----------------------------------------------------------------------

export interface ChallengeRule { n?: number; count?: number; action?: string; multiplier?: number }

export async function createChallenge(input: { name: string; kind: 'first_n' | 'do_x_by_date' | 'streak' | 'referral_push'; rule: ChallengeRule; points: number; startsAt?: string; endsAt?: string | null; announce?: boolean }, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from('challenges').insert({
    name: input.name.trim(), kind: input.kind, rule: input.rule, points: input.points,
    starts_at: input.startsAt ?? new Date().toISOString(), ends_at: input.endsAt ?? null, created_by: actorClerkId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'challenge.created', target: `challenge:${data.id}`, meta: { kind: input.kind } });
  if (input.announce) await announceToActiveFamilies(input.name, `New challenge: ${input.name} - ${input.points} Play Points!`);
  return data.id;
}

/**
 * Record a qualifying action for a family on a challenge. Auto-awards on rule
 * completion: first_n awards immediately while slots remain; do_x_by_date
 * awards when the count target is reached inside the window.
 */
export async function recordChallengeAction(challengeId: number, familyId: number): Promise<{ awarded: boolean; reason?: string }> {
  const db = supabaseAdmin();
  const { data: ch } = await db.from('challenges').select('*').eq('id', challengeId).single();
  if (!ch || ch.status !== 'open') return { awarded: false, reason: 'challenge closed' };
  const now = Date.now();
  if (now < Date.parse(ch.starts_at) || (ch.ends_at && now > Date.parse(ch.ends_at))) return { awarded: false, reason: 'outside window' };

  // Upsert progress + increment.
  const { data: existing } = await db.from('challenge_progress').select('id, actions, awarded').eq('challenge_id', challengeId).eq('family_id', familyId).maybeSingle();
  if (existing?.awarded) return { awarded: false, reason: 'already awarded' };
  const actions = (existing?.actions ?? 0) + 1;
  if (existing) await db.from('challenge_progress').update({ actions }).eq('id', existing.id);
  else await db.from('challenge_progress').insert({ challenge_id: challengeId, family_id: familyId, actions });

  const rule = (ch.rule ?? {}) as ChallengeRule;
  let complete = false;
  if (ch.kind === 'first_n') {
    const { count: awardedSoFar } = await db.from('challenge_progress').select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId).eq('awarded', true);
    complete = (awardedSoFar ?? 0) < (rule.n ?? 0);
    if (!complete) return { awarded: false, reason: 'slots filled' };
  } else if (ch.kind === 'do_x_by_date') {
    complete = actions >= (rule.count ?? 1);
    if (!complete) return { awarded: false, reason: `progress ${actions}/${rule.count}` };
  } else {
    // streak / referral_push complete per action (multiplier handled by points value)
    complete = true;
  }

  await db.from('challenge_progress').update({ awarded: true, completed_at: new Date().toISOString() }).eq('challenge_id', challengeId).eq('family_id', familyId);
  await applyPlayPoints(familyId, ch.points, `challenge: ${ch.name}`, 'system:promotions', `challenge:${challengeId}`);
  return { awarded: true };
}

// --- streaks & badges -----------------------------------------------------------------

/**
 * Consecutive-season streak from registration history: count backwards from the
 * family's most recent registered season through unbroken prior seasons.
 */
export async function seasonStreak(familyId: number): Promise<number> {
  const { data } = await supabaseAdmin()
    .from('registrations').select('programs(season_key)').eq('family_id', familyId).in('status', ['active', 'withdrawn']);
  const keys = [...new Set((data ?? []).map((r) => (r.programs as unknown as { season_key: string | null } | null)?.season_key).filter((k): k is string => !!k))];
  if (keys.length === 0) return 0;
  // Order seasons chronologically: year asc, then season order.
  const ORDER = ['jan-apr', 'may-aug', 'sep-dec'];
  const idx = (k: string) => { const [y, s] = k.split(':'); return Number(y) * 3 + ORDER.indexOf(s); };
  const sorted = keys.map(idx).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  let streak = 1;
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    if (sorted[i] - sorted[i - 1] === 1) streak += 1;
    else break;
  }
  return streak;
}

/** Evaluate + award badges (idempotent; each badge once per family). */
export async function awardBadges(familyId: number): Promise<string[]> {
  const db = supabaseAdmin();
  const { data: have } = await db.from('family_badges').select('badge_key').eq('family_id', familyId);
  const owned = new Set((have ?? []).map((b) => b.badge_key));

  const { count: regs } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('family_id', familyId).in('status', ['active', 'withdrawn']);
  const { count: referrals } = await db.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_family_id', familyId).eq('status', 'rewarded');
  const { loyaltySeasons } = await import('@/lib/points/points');
  const seasons = await loyaltySeasons(familyId);
  const streak = await seasonStreak(familyId);

  const earned: string[] = [];
  const tryAward = async (key: string, condition: boolean) => {
    if (!condition || owned.has(key)) return;
    await db.from('family_badges').insert({ family_id: familyId, badge_key: key });
    earned.push(key);
  };
  await tryAward('first_season', (regs ?? 0) > 0);
  await tryAward('referral_champ', (referrals ?? 0) >= 3);
  await tryAward('superfan', seasons >= 5);
  await tryAward('streak_keeper', streak >= 3);
  return earned;
}

export async function familyBadges(familyId: number): Promise<Array<{ key: string; label: string; description: string | null }>> {
  const { data } = await supabaseAdmin().from('family_badges').select('badge_key, badges(label, description)').eq('family_id', familyId);
  return (data ?? []).map((b) => {
    const def = b.badges as unknown as { label: string; description: string | null };
    return { key: b.badge_key, label: def.label, description: def.description };
  });
}
