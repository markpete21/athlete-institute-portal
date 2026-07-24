import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { createDivision } from '@/lib/competitive/competitive';
import { dunningConfig, markRecovered, openCase, processDunning, updateDunningConfig } from '@/lib/dunning/dunning';
import { explainDraft, latestExplanation } from '@/lib/team-explainer/explainer';

/**
 * DEV-ONLY: Module 18 - dunning escalation path + timing (retry->email->sms->
 * task+Overdue), retry-recovers path, config tunable, recovery clears flag;
 * team-balance explainer generated from real draft data, admin-private.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  let famId: number | null = null;
  let divisionId: number | null = null;
  const instIds: number[] = [];

  try {
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Dunning Program', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);

    const { data: fam } = await db.from('families').insert({ name: 'Dunning Fam' }).select('id').single();
    famId = fam!.id;
    const { data: order } = await db.from('program_orders').insert({ family_id: famId, subtotal_cents: 50000, total_cents: 50000, status: 'plan_active', created_by: 'system:verify' }).select('id').single();
    const mkInst = async (seq: number) => (await db.from('program_installments').insert({ order_id: order!.id, seq, label: `Inst ${seq}`, amount_cents: 25000, due_date: '2026-07-01', status: 'failed' }).select('id').single()).data!.id;
    const instA = await mkInst(1);
    const instB = await mkInst(2);
    instIds.push(instA, instB);

    // 1. case opens (idempotent)
    const c1 = await openCase(instA, { failedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() });
    const c1again = await openCase(instA);
    await openCase(instB, { failedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() });
    record('case opens once per installment (idempotent)', c1 !== null && c1again === null, `case ${c1}, dup ${c1again}`);

    // 2. escalation walks the ladder step by step (each pass advances one step
    //    because every threshold has long passed)
    const failRetry = async () => false; // charge still fails
    const p1 = await processDunning({ retryCharge: failRetry });
    const p2 = await processDunning({ retryCharge: failRetry });
    const p3 = await processDunning({ retryCharge: failRetry });
    const p4 = await processDunning({ retryCharge: failRetry });
    record('escalation: retry -> email -> sms -> call task', p1.retried === 2 && p2.emailed === 2 && p3.smsed === 2 && p4.tasksCreated === 2, JSON.stringify({ p1: p1.retried, p2: p2.emailed, p3: p3.smsed, p4: p4.tasksCreated }));

    // 3. final step flags the account Overdue + creates a call task
    const { data: famRow } = await db.from('families').select('overdue').eq('id', famId).single();
    const { count: tasks } = await db.from('retention_tasks').select('id', { count: 'exact', head: true }).eq('created_by', 'system:dunning');
    record('final step: Overdue flag + staff call task', famRow!.overdue === true && (tasks ?? 0) >= 2, `overdue=${famRow!.overdue}, ${tasks} tasks`);

    // 4. recovery closes the case; flag clears when ALL cases recovered
    await markRecovered(instA);
    const { data: still } = await db.from('families').select('overdue').eq('id', famId).single();
    await markRecovered(instB);
    const { data: cleared } = await db.from('families').select('overdue').eq('id', famId).single();
    record('recovery clears Overdue only when all cases closed', still!.overdue === true && cleared!.overdue === false, `mid=${still!.overdue}, end=${cleared!.overdue}`);

    // 5. retry-recovers path: a new case whose auto-retry succeeds closes immediately
    const instC = await mkInst(3);
    instIds.push(instC);
    await openCase(instC, { failedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() });
    await processDunning({ retryCharge: async () => true });
    const { data: cRow } = await db.from('dunning_cases').select('step, recovered_at').eq('installment_id', instC).single();
    record('successful auto-retry recovers without escalating', cRow!.step === 'recovered' && !!cRow!.recovered_at, cRow!.step);

    // 6. timings configurable
    const before = await dunningConfig();
    await updateDunningConfig({ retryAfterDays: 7 }, 'system:verify');
    const after = await dunningConfig();
    await updateDunningConfig({ retryAfterDays: before.retryAfterDays }, 'system:verify');
    record('step timing configurable', after.retryAfterDays === 7 && before.retryAfterDays === 3, `${before.retryAfterDays} -> ${after.retryAfterDays}`);

    // 7. team-balance explainer from real draft data (fallback path), admin-private
    divisionId = await createDivision({ programId: prog.id, name: 'Explain Div', sport: 'basketball' }, 'system:verify');
    const { data: t1 } = await db.from('teams').insert({ division_id: divisionId, name: 'Team 1' }).select('id').single();
    const { data: t2 } = await db.from('teams').insert({ division_id: divisionId, name: 'Team 2' }).select('id').single();
    await db.from('team_members').insert([
      { division_id: divisionId, team_id: t1!.id, locked: true },
      { division_id: divisionId, team_id: t1!.id, group_key: 'g1' },
      { division_id: divisionId, team_id: t2!.id, group_key: 'g1' },
      { division_id: divisionId, team_id: t2!.id },
    ]);
    const exp = await explainDraft(divisionId, 'system:verify');
    const latest = await latestExplanation(divisionId);
    record('explainer generated from draft data + stored (admin table)', exp.explanation.length > 50 && latest === exp.explanation, `${exp.source}: ${exp.explanation.slice(0, 70)}...`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (instIds.length) await db.from('dunning_cases').delete().in('installment_id', instIds);
    await db.from('retention_tasks').delete().eq('created_by', 'system:dunning');
    if (divisionId) { await db.from('team_balance_explainers').delete().eq('division_id', divisionId); await db.from('team_members').delete().eq('division_id', divisionId); await db.from('teams').delete().eq('division_id', divisionId); await db.from('divisions').delete().eq('id', divisionId); }
    if (famId) {
      const orderIds = (await db.from('program_orders').select('id').eq('family_id', famId)).data?.map((o) => o.id) ?? [];
      if (orderIds.length) { await db.from('program_installments').delete().in('order_id', orderIds); await db.from('program_orders').delete().in('id', orderIds); }
      await db.from('families').delete().eq('id', famId);
    }
    if (programIds.length) await db.from('programs').delete().in('id', programIds);
    record('cleanup', true, 'cases, tasks, division, orders, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
