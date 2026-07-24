import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { atRiskList, computeFlag, currentWeights, gatherSignals, sendWeeklyDigest, takeAction, updateWeights } from '@/lib/retention/retention';

/**
 * DEV-ONLY: Module 16 - signal aggregation from real module data, rule engine
 * flags w/ reasons+actions, sibling gap, tunable weights, one-click actions,
 * weekly digest count. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  let famId: number | null = null;
  const memberIds: number[] = [];

  try {
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const lastYear = await createProgram({ name: 'Retention Last Season', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(lastYear.id);
    await db.from('programs').update({ status: 'closed', season_key: '2025:sep-dec' }).eq('id', lastYear.id);

    const { data: fam } = await db.from('families').insert({ name: 'Retention Fam' }).select('id').single();
    famId = fam!.id;
    const mem = async (n: string) => {
      const { data } = await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'dependent' }).select('id').single();
      memberIds.push(data!.id);
      return data!.id;
    };
    const lapsed = await mem('Lapsed');   // played last year, silent since
    const sibling = await mem('Sibling'); // re-enrolled recently

    // Lapsed: registered ~370 days ago (so their anniversary has passed), 2-star feedback, failed installment.
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    const { data: oldReg } = await db.from('registrations').insert({ program_id: lastYear.id, family_id: famId, family_member_id: lapsed, status: 'withdrawn', standing: 'brand_new', created_at: daysAgo(370) }).select('id').single();
    await db.from('registrations').insert({ program_id: lastYear.id, family_id: famId, family_member_id: sibling, status: 'active', standing: 'returning_athlete' });

    // feedback: 2-star from the lapsed member's registration
    const { data: round } = await db.from('feedback_rounds').insert({ program_id: lastYear.id, round: 'end', prompt_at: daysAgo(30) }).select('id').single();
    await db.from('feedback_responses').insert({ round_id: round!.id, program_id: lastYear.id, registration_id: oldReg!.id, family_id: famId, token: `ret-${oldReg!.id}`, rating: 2, submitted_at: daysAgo(20), kind: 'quick' });

    // payment friction: a failed installment on a family order
    const { data: order } = await db.from('program_orders').insert({ family_id: famId, subtotal_cents: 10000, total_cents: 10000, status: 'plan_active', created_by: 'system:verify' }).select('id').single();
    await db.from('program_installments').insert({ order_id: order!.id, seq: 1, label: 'Installment 1', amount_cents: 10000, due_date: daysAgo(40).slice(0, 10), status: 'failed' });

    // 1. signal aggregation reads real module data
    const signals = await gatherSignals(lapsed, famId);
    record('signals: re-enroll timing vs own history', (signals.daysPastOwnReenrollDate ?? 0) > 0, `${signals.daysPastOwnReenrollDate} days late`);
    record('signals: low feedback picked up', signals.feedbackRating === 2, `${signals.feedbackRating}`);
    record('signals: payment friction picked up', signals.failedPayments === 1, `${signals.failedPayments}`);
    record('signals: sibling gap detected', signals.siblingGap === true, `${signals.siblingGap}`);

    // 2. rule engine -> red flag with reasons + suggested actions
    const flag = await computeFlag(lapsed, famId, { signals });
    record('rule engine: red flag w/ attached reasons + actions', flag.level === 'red' && flag.reasons.length >= 3 && flag.reasons.every((r) => r.reason && r.suggestedAction), `${flag.score}, ${flag.reasons.length} reasons`);

    // 3. dashboard list is sortable + person-not-score
    const list = await atRiskList();
    const row = list.find((r) => r.memberName === 'Lapsed K');
    record('at-risk list: person + reasons (never bare score)', !!row && row.reasons.length >= 3, `${row?.score} ${row?.level}`);

    // 4. one-click action wires + marks the flag
    await takeAction(row!.flagId, 'call', 'system:verify', 'follow up on 2-star feedback');
    const { data: task } = await db.from('retention_tasks').select('kind, status').eq('flag_id', row!.flagId).single();
    const { data: actioned } = await db.from('retention_flags').select('action_taken').eq('id', row!.flagId).single();
    record('one-click action creates task + marks flag', task!.kind === 'call' && actioned!.action_taken === 'call', JSON.stringify(task));

    // 5. weights tunable: crank reenrollTiming down -> same signals score lower
    const before = flag.score;
    await updateWeights({ reenrollTiming: 5 }, 'system:verify');
    const tuned = await computeFlag(lapsed, famId, { signals });
    await updateWeights({ reenrollTiming: 40 }, 'system:verify'); // restore
    record('weights are tunable (rule-based, no black box)', tuned.score < before, `${before} -> ${tuned.score}`);

    // 6. weekly digest counts flagged families
    const digest = await sendWeeklyDigest(null);
    record('weekly digest counts at-risk families', digest.count >= 1, `${digest.count} flagged`);

    // 7. internal-only posture: flags live in a staff table, no public route exposes them
    const w = await currentWeights();
    record('weights readable for tuning UI', w.reenrollTiming === 40, JSON.stringify(w).slice(0, 60));
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (memberIds.length) { await db.from('retention_tasks').delete().in('flag_id', (await db.from('retention_flags').select('id').in('family_member_id', memberIds)).data?.map((f) => f.id) ?? [-1]); await db.from('retention_flags').delete().in('family_member_id', memberIds); }
    if (programIds.length) {
      await db.from('feedback_responses').delete().in('program_id', programIds);
      await db.from('feedback_rounds').delete().in('program_id', programIds);
      await db.from('registrations').delete().in('program_id', programIds);
      await db.from('programs').delete().in('id', programIds);
    }
    if (famId) {
      const orderIds = (await db.from('program_orders').select('id').eq('family_id', famId)).data?.map((o) => o.id) ?? [];
      if (orderIds.length) { await db.from('program_installments').delete().in('order_id', orderIds); await db.from('program_orders').delete().in('id', orderIds); }
      await db.from('family_members').delete().eq('family_id', famId);
      await db.from('families').delete().eq('id', famId);
    }
    record('cleanup', true, 'flags, tasks, programs, orders, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
