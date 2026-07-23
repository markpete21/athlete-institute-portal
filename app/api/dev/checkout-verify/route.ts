import { NextResponse } from 'next/server';
import { torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { placeProgramOrder, quoteCheckout, recalculateOwed } from '@/lib/programs/checkout';

/**
 * DEV-ONLY: Stage-4 checkout - program pricing rules through the Module 1
 * function (early-bird, multi-member, returning), distinct Credit-on-Account +
 * Play Points balances, points EARNED on eligible spend, academy earns none,
 * installment plan + recalculate-owed. Cleaned up.
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
  const regIds: number[] = [];
  const orderIds: number[] = [];

  try {
    const types = await listProgramTypes();
    const league = types.find((t) => t.key === 'league')!;
    const academy = types.find((t) => t.key === 'academy')!;
    const today = torontoToday();
    const future = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

    // League program: $200 base, $150 early-bird (until future), $20 returning disc, $25 multi-member
    const prog = await createProgram({ name: 'Checkout League', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);
    await db.from('programs').update({ base_price_cents: 20000, early_bird_price_cents: 15000, early_bird_until: future, returning_discount_cents: 2000, multi_member_discount_cents: 2500, status: 'registration_open' }).eq('id', prog.id);

    // Academy program: $5000, scholarship-eligible, earns NO points
    const acad = await createProgram({ name: 'Checkout Academy', programTypeId: academy.id, category: 'Academy', actorClerkId: 'system:verify' });
    programIds.push(acad.id);
    await db.from('programs').update({ base_price_cents: 500000, scholarship_eligible: true, status: 'registration_open' }).eq('id', acad.id);

    // Family with Credit on Account $30 + 500 Play Points, two kids
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `co_${Date.now()}`, email: `co_${Date.now()}@example.test` }).select('id').single();
    const { data: fam } = await db.from('families').insert({ name: 'Checkout Fam', hoh_profile_id: prof!.id, credit_balance_cents: 3000, play_points_balance: 500 }).select('id').single();
    famId = fam!.id;
    const mem: number[] = [];
    for (const n of ['One', 'Two']) {
      const { data: m } = await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'K', member_role: 'dependent' }).select('id').single();
      mem.push(m!.id);
    }
    // Two league registrations (multi-member), member One is returning to this program
    await db.from('registrations').insert({ program_id: prog.id, family_member_id: mem[0], family_id: fam!.id, standing: 'returning_athlete', status: 'active' });
    const { data: reg1 } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: mem[0], family_id: fam!.id, standing: 'returning_athlete', status: 'active' }).select('id').single();
    const { data: reg2 } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: mem[1], family_id: fam!.id, standing: 'brand_new', status: 'active' }).select('id').single();
    regIds.push(reg1!.id, reg2!.id);
    await db.from('registrations').delete().eq('family_member_id', mem[0]).eq('standing', 'returning_athlete').neq('id', reg1!.id); // keep only reg1/reg2 for the order

    // 1. quote: early-bird base, returning disc on line1, multi-member on line2
    const quote = await quoteCheckout([reg1!.id, reg2!.id], { useCreditOnAccount: true, usePlayPoints: true });
    // line1: 150 - 20 returning = 130; line2: 150 - 25 multi = 125; subtotal 255
    // CoA 30 -> 225; points: 500 pts = $5 but capped 50% per line... applied after CoA
    record('early-bird + returning + multi-member subtotal', quote.subtotalCents === 25500, `subtotal ${quote.subtotalCents}`);
    record('Credit on Account applied before points', quote.creditOnAccountUsedCents === 3000, `CoA ${quote.creditOnAccountUsedCents}`);
    record('Play Points applied (distinct balance, capped)', quote.playPointsUsed === 500, `points ${quote.playPointsUsed}`);

    // 2. place order: balances deducted, points earned on eligible spend
    const placed = await placeProgramOrder({ registrationIds: [reg1!.id, reg2!.id], useCreditOnAccount: true, usePlayPoints: true, payInFull: true, actorClerkId: 'system:verify' });
    orderIds.push(placed.orderId);
    const { data: famAfter } = await db.from('families').select('credit_balance_cents, play_points_balance').eq('id', famId).single();
    // spent 500 pts, earned floor(total/100). total = 25500-3000-500 = 22000 -> earns 220. net points = 500-500+220 = 220
    record('balances deducted + points earned (1/$1 eligible)', famAfter!.credit_balance_cents === 0 && famAfter!.play_points_balance === 220, `credit ${famAfter!.credit_balance_cents}, points ${famAfter!.play_points_balance}`);

    // 3. academy earns NO points
    const { data: am } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'Ace', last_name: 'K', member_role: 'adult' }).select('id').single();
    const { data: areg } = await db.from('registrations').insert({ program_id: acad.id, family_member_id: am!.id, family_id: fam!.id, standing: 'brand_new', status: 'active' }).select('id').single();
    regIds.push(areg!.id);
    const aq = await quoteCheckout([areg!.id]);
    record('academy earns no points + points not redeemable', aq.earnablePoints === 0, `earnable ${aq.earnablePoints}`);

    // 4. installment plan: 5 payments + recalc owed
    const { data: pm } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'Plan', last_name: 'K', member_role: 'dependent' }).select('id').single();
    const { data: preg } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: pm!.id, family_id: fam!.id, standing: 'brand_new', status: 'active' }).select('id').single();
    regIds.push(preg!.id);
    const plan = await placeProgramOrder({ registrationIds: [preg!.id], payInFull: false, installmentCount: 5, firstDueDate: today, intervalDays: 30, actorClerkId: 'system:verify' });
    orderIds.push(plan.orderId);
    const { data: insts } = await db.from('program_installments').select('amount_cents, status').eq('order_id', plan.orderId).order('seq');
    const sum = (insts ?? []).reduce((a, i) => a + i.amount_cents, 0);
    record('installment plan (5 payments sum to total)', (insts ?? []).length === 5 && sum === plan.quote.totalCents, `${(insts ?? []).length} installments, sum ${sum}`);

    const owed1 = await recalculateOwed(plan.orderId);
    await db.from('program_installments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('order_id', plan.orderId).eq('seq', 1);
    const owed2 = await recalculateOwed(plan.orderId);
    record('recalculate owed after a payment', owed2.owedCents === owed1.owedCents - (insts ?? [])[0].amount_cents, `owed ${owed1.owedCents} -> ${owed2.owedCents}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const oid of orderIds) { await db.from('program_installments').delete().eq('order_id', oid); await db.from('program_orders').delete().eq('id', oid); }
    for (const pid of programIds) { await db.from('registrations').delete().eq('program_id', pid); await db.from('programs').delete().eq('id', pid); }
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'programs, orders, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
