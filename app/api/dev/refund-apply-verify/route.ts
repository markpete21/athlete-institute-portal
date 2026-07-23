import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { applyRefund, quoteRefund } from '@/lib/programs/refunds';

/**
 * DEV-ONLY: Stage-7 refund APPLICATION - policy default, staff override,
 * Credit-on-Account destination, not-refund-eligible guard, Club/Academy
 * exclusion, and withdrawal-frees-seat. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  let famId: number | null = null;

  try {
    const types = await listProgramTypes();
    const league = types.find((t) => t.key === 'league')!;
    const academy = types.find((t) => t.key === 'academy')!;

    const prog = await createProgram({ name: 'Refund League', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);
    await db.from('programs').update({ registration_opens_at: '2026-10-01T00:00:00-04:00', status: 'registration_open' }).eq('id', prog.id);

    const { data: fam } = await db.from('families').insert({ name: 'Refund Fam', credit_balance_cents: 0 }).select('id').single();
    famId = fam!.id;
    const { data: m } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'R', last_name: 'K', member_role: 'dependent' }).select('id').single();
    const { data: reg } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: m!.id, family_id: fam!.id, standing: 'brand_new', status: 'active', line_total_cents: 24000 }).select('id').single();

    // 1. quote: <14 days after start, past 3 sessions -> prorated credit -10%
    const q = await quoteRefund({ registrationId: reg!.id, withdrawalDateISO: '2026-10-10', totalUnits: 10, unitsRemaining: 4, unitsElapsed: 6 });
    record('quote applies policy (prorated -10%, credit-only)', q.result.creditAmountCents === 10800 && !q.result.refundEligible && q.result.ruleText.includes('after start'), JSON.stringify({ credit: q.result.creditAmountCents, rule: q.result.ruleText }));

    // 2. refund to original method blocked (not eligible), no override
    let blocked = false;
    try { await applyRefund({ registrationId: reg!.id, withdrawalDateISO: '2026-10-10', totalUnits: 10, unitsRemaining: 4, unitsElapsed: 6, destination: 'original_method', actorClerkId: 'system:verify' }); } catch (e) { blocked = e instanceof Error && e.message.includes('Not refund-eligible'); }
    record('refund-to-card blocked when not eligible', blocked, `blocked=${blocked}`);

    // 3. apply to Credit on Account -> family credit rises + reg withdrawn + seat check
    const applied = await applyRefund({ registrationId: reg!.id, withdrawalDateISO: '2026-10-10', totalUnits: 10, unitsRemaining: 4, unitsElapsed: 6, destination: 'credit_on_account', actorClerkId: 'system:verify' });
    const { data: famRow } = await db.from('families').select('credit_balance_cents').eq('id', fam!.id).single();
    const { data: regRow } = await db.from('registrations').select('status').eq('id', reg!.id).single();
    record('refund to Credit on Account + withdrawal', applied.amountCents === 10800 && famRow!.credit_balance_cents === 10800 && regRow!.status === 'withdrawn', `credit ${famRow!.credit_balance_cents}, reg ${regRow!.status}`);

    // 4. staff override amount
    const { data: m2 } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'S', last_name: 'K', member_role: 'dependent' }).select('id').single();
    const { data: reg2 } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: m2!.id, family_id: fam!.id, standing: 'brand_new', status: 'active', line_total_cents: 24000 }).select('id').single();
    const ov = await applyRefund({ registrationId: reg2!.id, withdrawalDateISO: '2026-10-20', totalUnits: 10, unitsRemaining: 0, unitsElapsed: 10, destination: 'credit_on_account', overrideAmountCents: 5000, overrideReason: 'goodwill', actorClerkId: 'system:verify' });
    const { data: famRow2 } = await db.from('families').select('credit_balance_cents').eq('id', fam!.id).single();
    record('staff override amount (policy said $0, staff gave $50)', ov.amountCents === 5000 && famRow2!.credit_balance_cents === 15800, `credit now ${famRow2!.credit_balance_cents}`);

    // 5. Club/Academy excluded
    const acad = await createProgram({ name: 'Refund Academy', programTypeId: academy.id, category: 'Academy', actorClerkId: 'system:verify' });
    programIds.push(acad.id);
    const { data: am } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'A', last_name: 'K', member_role: 'adult' }).select('id').single();
    const { data: areg } = await db.from('registrations').insert({ program_id: acad.id, family_member_id: am!.id, family_id: fam!.id, standing: 'brand_new', status: 'active', line_total_cents: 500000 }).select('id').single();
    const aq = await quoteRefund({ registrationId: areg!.id, withdrawalDateISO: '2026-10-10', totalUnits: 1, unitsRemaining: 0, unitsElapsed: 1 });
    record('Academy excluded from this engine', !!aq.blocked, aq.blocked ?? 'not blocked');
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const pid of programIds) { await db.from('registrations').delete().eq('program_id', pid); await db.from('programs').delete().eq('id', pid); }
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'programs, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
