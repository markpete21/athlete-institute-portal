import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import {
  capacityAlerts, definitionInstances, outstandingBalances, programMargin, programsAtLocation,
  registrationReport, revenueSummary, topProgramsByRegistration, topProgramsByRevenue,
} from '@/lib/reports/reports';
import { buildExecReport, renderExecHtml } from '@/lib/reports/exec';
import { pushRevenue, qboStatus } from '@/lib/quickbooks/qbo';

/**
 * DEV-ONLY: Module 14 - three location rollup views, landing dashboard tops,
 * margin w/ itemized expenses + no staff double-count, registration report
 * (conversion/marketing), capacity nudges, exec report windows, QBO queue-when-
 * disconnected. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  const locationIds: number[] = [];
  let famId: number | null = null;
  const qboRefs: string[] = [];

  try {
    const type = (await listProgramTypes()).find((t) => t.key === 'league')!;

    // Multi-location: definition + 2 instances.
    const { data: loc1 } = await db.from('locations').insert({ name: 'Verify Orangeville' }).select('id').single();
    const { data: loc2 } = await db.from('locations').insert({ name: 'Verify Location 2' }).select('id').single();
    locationIds.push(loc1!.id, loc2!.id);

    const def = await createProgram({ name: 'U15 Verify Volleyball', programTypeId: type.id, actorClerkId: 'system:verify' });
    const inst2 = await createProgram({ name: 'U15 Verify Volleyball @ L2', programTypeId: type.id, actorClerkId: 'system:verify' });
    programIds.push(def.id, inst2.id);
    await db.from('programs').update({ location_id: loc1!.id, definition_id: def.id, status: 'registration_open', capacity: 10, quickbooks_class: 'VerifyClass' }).eq('id', def.id);
    await db.from('programs').update({ location_id: loc2!.id, definition_id: def.id, status: 'registration_open', capacity: 2 }).eq('id', inst2.id);

    // 1. three canonical location views
    const across = await definitionInstances(def.id);
    const atL2 = await programsAtLocation(loc2!.id);
    record('view 1: definition across all sites', across.length === 2 && across.some((p) => p.locationName === 'Verify Orangeville') && across.some((p) => p.locationName === 'Verify Location 2'), `${across.length} instances`);
    record('view 2: single instance has its own record', across.find((p) => p.id === inst2.id)?.locationId === loc2!.id, 'instance @ L2');
    record('view 3: all programs at a location', atL2.length === 1 && atL2[0].id === inst2.id, `${atL2.length} at L2`);

    // registrations w/ revenue + one waitlisted at the small instance
    const { data: fam } = await db.from('families').insert({ name: 'Reports Fam' }).select('id').single();
    famId = fam!.id;
    const mem = async (n: string) => (await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'dependent' }).select('id').single()).data!.id;
    for (let i = 0; i < 3; i += 1) {
      await db.from('registrations').insert({ program_id: def.id, family_id: fam!.id, family_member_id: await mem(`R${i}`), status: 'active', standing: i === 0 ? 'returning_athlete' : 'brand_new', line_total_cents: 20000, marketing_source: i === 0 ? 'instagram' : 'friend' });
    }
    await db.from('registrations').insert({ program_id: inst2.id, family_id: fam!.id, family_member_id: await mem('W1'), status: 'active', standing: 'brand_new', line_total_cents: 30000 });
    await db.from('registrations').insert({ program_id: inst2.id, family_id: fam!.id, family_member_id: await mem('W2'), status: 'active', standing: 'brand_new', line_total_cents: 30000 });
    await db.from('registrations').insert({ program_id: inst2.id, family_id: fam!.id, family_member_id: await mem('W3'), status: 'waitlisted', standing: 'brand_new', line_total_cents: 0 });

    // 2. landing dashboard tops (period + location filter)
    const topReg = await topProgramsByRegistration('7d');
    const topRegDef = topReg.find((t) => t.programId === def.id);
    record('top by registration (7d) counts new regs', (topRegDef?.count ?? 0) === 3, `${topRegDef?.count}`);
    const topRev = await topProgramsByRevenue('7d');
    const revInst2 = topRev.find((t) => t.programId === inst2.id);
    record('top by revenue counts line totals', (revInst2?.revenueCents ?? 0) === 60000, `${revInst2?.revenueCents}`);
    const topAtL2 = await topProgramsByRegistration('7d', { locationId: loc2!.id });
    record('location filter on dashboard tops', topAtL2.every((t) => t.programId === inst2.id) && topAtL2.length === 1, `${topAtL2.length}`);

    // 3. revenue summary by location dimension
    const byLoc = await revenueSummary('location');
    const l2Cut = byLoc.find((c) => c.key === 'Verify Location 2');
    record('revenue summary by location', (l2Cut?.revenueCents ?? 0) === 60000, JSON.stringify(l2Cut));

    // 4. margin: itemized QBO expenses, staff wages excluded (no double count)
    await db.from('qbo_expenses').insert([
      { qbo_id: `v-rent-${def.id}`, category: 'Rent', amount_cents: 10000, qbo_class: 'VerifyClass' },
      { qbo_id: `v-wage-${def.id}`, category: 'Staff Wages', amount_cents: 99999, qbo_class: 'VerifyClass' },
    ]);
    const margin = await programMargin(def.id);
    record('margin itemized + staff wages excluded', margin.revenueCents === 60000 && margin.expenseTotalCents === 10000 && margin.expensesByCategory.every((e) => e.category !== 'Staff Wages'), JSON.stringify({ rev: margin.revenueCents, exp: margin.expenseTotalCents }));

    // 5. registration report: fill rate, standings, marketing sources
    const rep = await registrationReport(def.id);
    record('registration report (fill/standing/source)', rep.total === 3 && rep.fillRate === 0.3 && rep.byStanding.returning_athlete === 1 && rep.marketingSources.friend === 2, JSON.stringify({ fill: rep.fillRate, src: rep.marketingSources }));

    // 6. capacity nudge: inst2 is FULL with waitlist -> waitlist_forming
    const alerts = await capacityAlerts();
    const inst2Alert = alerts.find((a) => a.programId === inst2.id);
    record('capacity nudge: waitlist forming at full instance', inst2Alert?.level === 'waitlist_forming', inst2Alert?.level ?? 'none');

    // 7. outstanding balances aggregates pending installments
    const outstanding = await outstandingBalances();
    record('outstanding balances query runs', typeof outstanding.totalOutstandingCents === 'number', `$${outstanding.totalOutstandingCents / 100}`);

    // 8. exec report builds + renders (window covered by pure tests)
    const exec = await buildExecReport('week');
    const html = renderExecHtml(exec);
    record('exec week-in-review builds + renders', exec.title === 'Week in Review' && html.includes('Top programs by registration'), exec.windowLabel);

    // 9. QBO not connected -> revenue push queues locally (idempotent)
    const status = await qboStatus();
    const ref = `verify:${def.id}:${Math.floor(Math.random() * 1e6)}`;
    qboRefs.push(ref);
    const push1 = await pushRevenue({ sourceRef: ref, amountCents: 12345, memo: 'verify' }, 'system:verify');
    const push2 = await pushRevenue({ sourceRef: ref, amountCents: 12345, memo: 'verify' }, 'system:verify');
    record('QBO disconnected: push queues locally, idempotent', !status.connected && push1.reason?.includes('queued') === true && push2.reason === 'already pushed', `${push1.reason} / ${push2.reason}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (programIds.length) {
      await db.from('capacity_nudges').delete().in('program_id', programIds);
      await db.from('registrations').delete().in('program_id', programIds);
      await db.from('qbo_expenses').delete().like('qbo_id', 'v-%');
      await db.from('programs').delete().in('id', programIds);
    }
    if (qboRefs.length) await db.from('qbo_revenue_pushes').delete().in('source_ref', qboRefs);
    if (locationIds.length) await db.from('locations').delete().in('id', locationIds);
    if (famId) { await db.from('family_members').delete().eq('family_id', famId); await db.from('families').delete().eq('id', famId); }
    record('cleanup', true, 'programs, locations, expenses, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
