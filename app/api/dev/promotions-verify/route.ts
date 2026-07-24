import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  awardBadges, closeContest, createChallenge, createContest, familyBadges, recordChallengeAction,
  recordScore, scoreboard, seasonStreak, spinWheel, wheelConfig,
} from '@/lib/promotions/promotions';

/**
 * DEV-ONLY: Module 20 - contest window + top-N award, wheel odds + unlock +
 * credit, challenge rule types (first_n / do_x_by_date), streak math, badges.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const famIds: number[] = [];
  const programIds: number[] = [];
  let contestId: number | null = null;
  const challengeIds: number[] = [];

  try {
    const mkFam = async (n: string) => {
      const { data } = await db.from('families').insert({ name: `Promo ${n}`, play_points_balance: 0 }).select('id').single();
      famIds.push(data!.id);
      return data!.id;
    };
    const f1 = await mkFam('A'), f2 = await mkFam('B'), f3 = await mkFam('C');

    // 1. contest: window enforcement + best-score board + top-N award
    contestId = await createContest({ name: 'Verify Hoops', gameKey: 'basketball', startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), rewardTopN: 2, rewardPoints: 1000 }, 'system:verify');
    await recordScore(contestId, f1, 50);
    await recordScore(contestId, f1, 80); // best counts
    await recordScore(contestId, f2, 70);
    await recordScore(contestId, f3, 10);
    const bad = await recordScore(contestId, f1, -5 as unknown as number);
    const board = await scoreboard(contestId);
    record('scores: best-per-family board, invalid rejected', board.length === 3 && board[0].familyId === f1 && board[0].best === 80 && !bad.recorded, JSON.stringify(board.slice(0, 2)));

    const closed = await closeContest(contestId, 'system:verify');
    const b1 = (await db.from('families').select('play_points_balance').eq('id', f1).single()).data!.play_points_balance;
    const b3 = (await db.from('families').select('play_points_balance').eq('id', f3).single()).data!.play_points_balance;
    record('top-N auto-award (top 2 of 3 win 1000)', closed.winners.length === 2 && b1 === 1000 && b3 === 0, `winners ${closed.winners.length}, f1=${b1}, f3=${b3}`);

    // window enforcement after close
    const late = await recordScore(contestId, f2, 999);
    record('closed contest rejects scores', !late.recorded, late.reason ?? '');

    // 2. wheel: locked below milestone, unlocks at lifetime earned, odds honored, credit
    const lockedSpin = await spinWheel(f3);
    record('wheel locked below lifetime milestone', 'locked' in lockedSpin, JSON.stringify(lockedSpin));
    // f1 has 1000 lifetime earned (contest) = exactly the default unlock
    const forced = await spinWheel(f1, { rng: () => 0 }); // rng 0 -> first prize (50 pts)
    const cfg = await wheelConfig();
    const afterSpin = (await db.from('families').select('play_points_balance').eq('id', f1).single()).data!.play_points_balance;
    record('wheel spin: rng->prize + points credited + logged', 'prize' in forced && forced.prize.label === cfg.prizes[0].label && afterSpin === 1000 + cfg.prizes[0].points, `${'prize' in forced ? forced.prize.label : ''}, bal ${afterSpin}`);
    const { count: spins } = await db.from('wheel_spins').select('id', { count: 'exact', head: true }).eq('family_id', f1);
    record('spin logged', (spins ?? 0) === 1, `${spins}`);

    // 3. challenge: first_n caps winners
    const firstN = await createChallenge({ name: 'First 2 win', kind: 'first_n', rule: { n: 2 }, points: 300 }, 'system:verify');
    challengeIds.push(firstN);
    const c1 = await recordChallengeAction(firstN, f1);
    const c2 = await recordChallengeAction(firstN, f2);
    const c3 = await recordChallengeAction(firstN, f3);
    record('first_n: first 2 awarded, 3rd blocked', c1.awarded && c2.awarded && !c3.awarded && c3.reason === 'slots filled', JSON.stringify({ c1: c1.awarded, c2: c2.awarded, c3: c3.reason }));

    // 4. challenge: do_x_by_date needs the count
    const doX = await createChallenge({ name: 'Attend 3 drop-ins', kind: 'do_x_by_date', rule: { count: 3 }, points: 400, endsAt: new Date(Date.now() + 86_400_000).toISOString() }, 'system:verify');
    challengeIds.push(doX);
    const p1 = await recordChallengeAction(doX, f3);
    const p2 = await recordChallengeAction(doX, f3);
    const p3 = await recordChallengeAction(doX, f3);
    const balF3 = (await db.from('families').select('play_points_balance').eq('id', f3).single()).data!.play_points_balance;
    record('do_x_by_date: awards on 3rd action only', !p1.awarded && !p2.awarded && p3.awarded && balF3 === 400, `${p1.reason} -> ${p2.reason} -> awarded, bal ${balF3}`);

    // 5. streak math: 3 consecutive seasons -> streak 3; gap resets
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const mkReg = async (fam: number, season: string) => {
      const p = await createProgram({ name: `Promo ${season}`, programTypeId: league.id, actorClerkId: 'system:verify' });
      programIds.push(p.id);
      await db.from('programs').update({ season_key: season }).eq('id', p.id);
      const { data: mem } = await db.from('family_members').insert({ family_id: fam, first_name: 'S', last_name: 'K', member_role: 'dependent' }).select('id').single();
      await db.from('registrations').insert({ program_id: p.id, family_id: fam, family_member_id: mem!.id, status: 'active', standing: 'brand_new' });
    };
    await mkReg(f1, '2025:sep-dec');
    await mkReg(f1, '2026:jan-apr');
    await mkReg(f1, '2026:may-aug');
    await mkReg(f2, '2024:sep-dec'); // then a gap
    await mkReg(f2, '2026:may-aug');
    record('streak: 3 consecutive seasons = 3', (await seasonStreak(f1)) === 3, `${await seasonStreak(f1)}`);
    record('streak: gap resets to 1', (await seasonStreak(f2)) === 1, `${await seasonStreak(f2)}`);

    // 6. badges: first_season + streak_keeper for f1; idempotent
    const earned = await awardBadges(f1);
    const again = await awardBadges(f1);
    const badges = await familyBadges(f1);
    record('badges awarded once (first_season + streak_keeper)', earned.includes('first_season') && earned.includes('streak_keeper') && again.length === 0 && badges.length >= 2, JSON.stringify(earned));
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (contestId) { await db.from('contest_scores').delete().eq('contest_id', contestId); await db.from('contests').delete().eq('id', contestId); }
    if (challengeIds.length) { await db.from('challenge_progress').delete().in('challenge_id', challengeIds); await db.from('challenges').delete().in('id', challengeIds); }
    if (famIds.length) {
      await db.from('family_badges').delete().in('family_id', famIds);
      await db.from('wheel_spins').delete().in('family_id', famIds);
      await db.from('play_points_ledger').delete().in('family_id', famIds);
      await db.from('family_members').delete().in('family_id', famIds);
    }
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famIds.length) await db.from('families').delete().in('id', famIds);
    record('cleanup', true, 'contests, challenges, spins, badges, programs, families removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
