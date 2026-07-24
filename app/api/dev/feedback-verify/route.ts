import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  FULL_FORM_POINTS, QUICK_REVIEW_POINTS, anonymousReviews, attributedResponses, configureRounds,
  formByToken, processDuePrompts, programRating, ratingForType, rollupRating, submitFeedback, summarizeFeedback,
} from '@/lib/feedback/feedback';

/**
 * DEV-ONLY: Module 15 - round timing per type (end + club mid), prompt fan-out,
 * one-response enforcement, points credited once (50 quick / 250 full), rating
 * rollups, low-score alert path, anonymous vs attributed views, public toggle.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  let famId: number | null = null;
  let profileId: number | null = null;

  try {
    const types = await listProgramTypes();
    const league = types.find((t) => t.key === 'league')!;
    const club = types.find((t) => t.key === 'club')!;

    const P = await createProgram({ name: 'Feedback League', programTypeId: league.id, actorClerkId: 'system:verify' });
    const C = await createProgram({ name: 'Feedback Club', programTypeId: club.id, actorClerkId: 'system:verify' });
    programIds.push(P.id, C.id);
    await db.from('programs').update({ status: 'registration_open' }).in('id', [P.id, C.id]);

    // Sessions in the past so the END round is already due.
    const past = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    await db.from('program_sessions').insert([
      { program_id: P.id, starts_at: past(30), ends_at: past(30) },
      { program_id: P.id, starts_at: past(3), ends_at: past(3) },
      { program_id: C.id, starts_at: past(200), ends_at: past(200) },
      { program_id: C.id, starts_at: past(2), ends_at: past(2) },
    ]);

    // 1. round timing: league -> end only; club -> end + mid
    const leagueRounds = await configureRounds(P.id);
    const clubRounds = await configureRounds(C.id);
    record('league gets END round only', leagueRounds.length === 1 && leagueRounds[0].round === 'end', JSON.stringify(leagueRounds.map((r) => r.round)));
    record('club gets END + MID rounds', clubRounds.length === 2 && clubRounds.some((r) => r.round === 'mid'), JSON.stringify(clubRounds.map((r) => r.round)));

    // family + registrations
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `fb-verify-${P.id}`, email: `fb-${P.id}@example.test` }).select('id').single();
    profileId = prof!.id;
    const { data: fam } = await db.from('families').insert({ name: 'FB Fam', hoh_profile_id: prof!.id, play_points_balance: 0 }).select('id').single();
    famId = fam!.id;
    const mem = async (n: string) => (await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'dependent' }).select('id').single()).data!.id;
    const r1 = (await db.from('registrations').insert({ program_id: P.id, family_id: fam!.id, family_member_id: await mem('A'), status: 'active', standing: 'brand_new' }).select('id').single()).data!;
    const r2 = (await db.from('registrations').insert({ program_id: P.id, family_id: fam!.id, family_member_id: await mem('B'), status: 'active', standing: 'brand_new' }).select('id').single()).data!;

    // 2. prompt fan-out creates pre-identified deep links (one per registration)
    const { prompted } = await processDuePrompts('https://test.local');
    const { data: resps } = await db.from('feedback_responses').select('id, token, registration_id').eq('program_id', P.id);
    record('prompt fan-out: one deep link per registration', (resps ?? []).length === 2 && prompted >= 2, `${(resps ?? []).length} links, ${prompted} prompted`);

    const tokA = resps!.find((r) => r.registration_id === r1.id)!.token;
    const tokB = resps!.find((r) => r.registration_id === r2.id)!.token;

    // 3. deep link form is pre-identified
    const form = await formByToken(tokA);
    record('deep link pre-identified (program + participant)', form?.programName === 'Feedback League' && form?.participantName === 'A K', JSON.stringify({ p: form?.programName, m: form?.participantName }));

    // 4. quick review (star-only) = 50 pts, credited once
    const balBefore = (await db.from('families').select('play_points_balance').eq('id', famId).single()).data!.play_points_balance;
    const quick = await submitFeedback(tokA, { rating: 5, comment: 'Great season' });
    let doubleBlocked = false;
    try { await submitFeedback(tokA, { rating: 4 }); } catch { doubleBlocked = true; }
    const balAfterQuick = (await db.from('families').select('play_points_balance').eq('id', famId).single()).data!.play_points_balance;
    record('quick review credits 50 pts ONCE', quick.pointsAwarded === QUICK_REVIEW_POINTS && doubleBlocked && balAfterQuick - balBefore === QUICK_REVIEW_POINTS, `+${balAfterQuick - balBefore}, resubmit blocked=${doubleBlocked}`);

    // 5. full form (answers) = 250 pts; 2-star triggers low-score alert path
    const full = await submitFeedback(tokB, { rating: 2, comment: 'Refs were rough', answers: { scheduling: '3', officiating: '1' } });
    const balAfterFull = (await db.from('families').select('play_points_balance').eq('id', famId).single()).data!.play_points_balance;
    record('full form credits 250 pts + low-score alert fires', full.pointsAwarded === FULL_FORM_POINTS && full.lowScoreAlerted && balAfterFull - balAfterQuick === FULL_FORM_POINTS, `+${balAfterFull - balAfterQuick}, alerted=${full.lowScoreAlerted}`);

    // 6. rating model: program average + rollups
    const rating = await programRating(P.id);
    record('program rating averages rating-of-record', rating.average === 3.5 && rating.responses === 2, JSON.stringify(rating));
    const roll = await rollupRating([P.id, C.id]);
    record('rollup across programs', roll.responses === 2 && roll.average === 3.5, JSON.stringify(roll));
    const typeRoll = await ratingForType('league');
    record('type-level rollup includes program', typeRoll.responses >= 2, `${typeRoll.responses} responses`);

    // 7. attribution internal vs anonymous display
    const attributed = await attributedResponses(P.id);
    const anon = await anonymousReviews(P.id);
    record('attributed internally / anonymous on display', attributed.some((a) => a.respondent === 'B K') && anon.every((a) => !('respondent' in a) && !JSON.stringify(a).includes('B K')), `${attributed.length} attributed`);

    // 8. public toggle (private by default)
    const { data: progRow } = await db.from('programs').select('rating_public').eq('id', P.id).single();
    await db.from('programs').update({ rating_public: true }).eq('id', P.id);
    const { data: progRow2 } = await db.from('programs').select('rating_public').eq('id', P.id).single();
    record('rating private by default, public toggle works', progRow!.rating_public === false && progRow2!.rating_public === true, 'toggled');

    // 9. AI summary (fallback path without key) stored + anonymized
    const sum = await summarizeFeedback(P.id);
    record('feedback summary generated + stored', sum.summary.length > 0 && !sum.summary.includes('B K'), `${sum.source}: ${sum.summary.slice(0, 60)}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (programIds.length) {
      await db.from('feedback_summaries').delete().in('program_id', programIds);
      await db.from('feedback_responses').delete().in('program_id', programIds);
      await db.from('feedback_rounds').delete().in('program_id', programIds);
      await db.from('program_sessions').delete().in('program_id', programIds);
      await db.from('registrations').delete().in('program_id', programIds);
      await db.from('programs').delete().in('id', programIds);
    }
    if (famId) { await db.from('play_points_ledger').delete().eq('family_id', famId); await db.from('family_members').delete().eq('family_id', famId); await db.from('families').delete().eq('id', famId); }
    if (profileId) await db.from('profiles').delete().eq('id', profileId);
    record('cleanup', true, 'programs, responses, rounds, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
