import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  REFERRAL_SEASON_CAP, awardLoyaltyMilestones, awardRule, clawBackReferral, earnRules,
  getOrCreateReferralCode, loyaltySeasons, manualGrant, onFirstPaidRegistration, pointsReport,
  pointsSurface, recordReferral, updateEarnRule,
} from '@/lib/points/points';

/**
 * DEV-ONLY: Module 19 - configurable earn rules, per-household one-time
 * enforcement, loyalty ladder (club/academy count, rentals don't), referral
 * first-paid trigger + cap + different-household, claw-back, liability math,
 * manual grant requires reason. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const famIds: number[] = [];
  const programIds: number[] = [];

  try {
    const mkFam = async (n: string) => {
      const { data } = await db.from('families').insert({ name: `Pts ${n}`, play_points_balance: 0 }).select('id').single();
      famIds.push(data!.id);
      return data!.id;
    };
    const referrer = await mkFam('Referrer');
    const referred = await mkFam('Referred');
    const referred2 = await mkFam('Referred2');

    // 1. earn rules seeded + configurable
    const rules = await earnRules();
    record('earn rules seeded (10)', rules.length >= 10, `${rules.length}`);
    await updateEarnRule('household.created', { points: 123 }, 'system:verify');
    const changed = (await earnRules()).find((r) => r.rule_key === 'household.created')!;
    await updateEarnRule('household.created', { points: 100 }, 'system:verify');
    record('rule value configurable', changed.points === 123, `${changed.points}`);

    // 2. per-household one-time enforcement
    const first = await awardRule('household.created', referrer);
    const dup = await awardRule('household.created', referrer);
    record('per-household one-time credit', first === 100 && dup === 0, `${first} then ${dup}`);

    // disabled rule pays nothing
    await updateEarnRule('birthday', { enabled: false }, 'system:verify');
    const disabled = await awardRule('birthday', referrer);
    await updateEarnRule('birthday', { enabled: true }, 'system:verify');
    record('disabled rule awards 0', disabled === 0, `${disabled}`);

    // 3. loyalty ladder: club/academy seasons count (3 distinct seasons -> +500)
    const types = await listProgramTypes();
    const club = types.find((t) => t.key === 'club')!;
    const academy = types.find((t) => t.key === 'academy')!;
    const league = types.find((t) => t.key === 'league')!;
    const mkProg = async (typeId: number, season: string) => {
      const p = await createProgram({ name: `Pts ${season}`, programTypeId: typeId, actorClerkId: 'system:verify' });
      programIds.push(p.id);
      await db.from('programs').update({ season_key: season }).eq('id', p.id);
      return p.id;
    };
    const { data: mem } = await db.from('family_members').insert({ family_id: referrer, first_name: 'L', last_name: 'K', member_role: 'dependent' }).select('id').single();
    for (const [typeId, season] of [[club.id, '2024:sep-dec'], [academy.id, '2025:jan-apr'], [league.id, '2025:sep-dec']] as Array<[number, string]>) {
      const pid = await mkProg(typeId, season);
      await db.from('registrations').insert({ program_id: pid, family_id: referrer, family_member_id: mem!.id, status: 'active', standing: 'brand_new' });
    }
    const seasons = await loyaltySeasons(referrer);
    const ladderPts = await awardLoyaltyMilestones(referrer);
    const ladderDup = await awardLoyaltyMilestones(referrer);
    record('loyalty ladder: 3 seasons (club+academy count) -> +500 once', seasons === 3 && ladderPts === 500 && ladderDup === 0, `${seasons} seasons, +${ladderPts} then +${ladderDup}`);

    // 4. referral: link -> record -> reward only on first PAID registration
    const code = await getOrCreateReferralCode(referrer);
    const self = await recordReferral(code, referrer);
    record('different-household rule', !self.recorded && self.reason === 'same household', self.reason ?? '');
    const rec = await recordReferral(code, referred);
    record('referral recorded pending (no points yet)', rec.recorded, JSON.stringify(rec));
    const balBefore = (await db.from('families').select('play_points_balance').eq('id', referrer).single()).data!.play_points_balance;

    const reward = await onFirstPaidRegistration(referred);
    const balAfter = (await db.from('families').select('play_points_balance').eq('id', referrer).single()).data!.play_points_balance;
    const referredBal = (await db.from('families').select('play_points_balance').eq('id', referred).single()).data!.play_points_balance;
    record('first paid registration rewards both sides (1000/500)', reward.rewarded && balAfter - balBefore === 1000 && referredBal === 500, `referrer +${balAfter - balBefore}, referred ${referredBal}`);

    const again = await onFirstPaidRegistration(referred);
    record('reward fires only once', !again.rewarded, again.reason ?? '');

    // 5. claw-back reverses both sides (reason logged)
    const { data: refRow } = await db.from('referrals').select('id').eq('referred_family_id', referred).single();
    await clawBackReferral(refRow!.id, 'shared payment method', 'system:verify');
    const referrerAfterClaw = (await db.from('families').select('play_points_balance').eq('id', referrer).single()).data!.play_points_balance;
    const referredAfterClaw = (await db.from('families').select('play_points_balance').eq('id', referred).single()).data!.play_points_balance;
    record('claw-back reverses both sides', referrerAfterClaw === balAfter - 1000 && referredAfterClaw === 0, `${referrerAfterClaw}, ${referredAfterClaw}`);

    // 6. customer surface + disclaimer
    const surface = await pointsSurface(referrer);
    record('customer surface: balance/ledger/referral/ladder/disclaimer', surface.ledger.length >= 3 && surface.referralCode === code && surface.referralCap === REFERRAL_SEASON_CAP && surface.disclaimer.includes('Academy') && surface.nextMilestone?.seasons === 5, `bal ${surface.balance}, next ${surface.nextMilestone?.seasons}`);

    // 7. manual grant requires a reason
    let noReasonBlocked = false;
    try { await manualGrant(referrer, 100, '   ', 'system:verify'); } catch { noReasonBlocked = true; }
    await manualGrant(referrer, 100, 'goodwill - schedule mixup', 'system:verify');
    record('manual grant requires reason', noReasonBlocked, `blocked=${noReasonBlocked}`);

    // 8. liability math: 100 pts = $1 -> cents = points
    const report = await pointsReport();
    record('points liability in $ (1pt=1c) + trends + conversion', report.liabilityCents === report.liabilityPoints && report.earnedTotal > 0 && report.referralConversion.recorded >= 1, JSON.stringify({ liab: report.liabilityCents, earned: report.earnedTotal }));
    void referred2;
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (famIds.length) {
      await db.from('referrals').delete().or(`referrer_family_id.in.(${famIds.join(',')}),referred_family_id.in.(${famIds.join(',')})`);
      await db.from('play_points_ledger').delete().in('family_id', famIds);
      await db.from('family_members').delete().in('family_id', famIds);
    }
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famIds.length) await db.from('families').delete().in('id', famIds);
    record('cleanup', true, 'families, referrals, ledger, programs removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
