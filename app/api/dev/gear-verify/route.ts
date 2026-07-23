import { NextResponse } from 'next/server';
import { aggregateGearOrder, resolveJerseyNumber } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { placeProgramOrder } from '@/lib/programs/checkout';
import { buildGearOrder, createProduct, offerProduct, setJerseyExtras, setJerseySelection } from '@/lib/programs/gear';

/**
 * DEV-ONLY: Stage-5 products + jersey/gear - pure aggregation + number dedup,
 * product/variant offering, per-registrant sizing with no-dup numbers,
 * aggregated supplier order (sizes + extras), add-on folded into order total.
 * Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  let programId: number | null = null;
  let famId: number | null = null;
  let productId: number | null = null;
  const orderIds: number[] = [];

  try {
    // 0. pure aggregation + number dedup
    const agg = aggregateGearOrder(['YM', 'YM', 'AS', 'AL', 'AL', 'AL'], { YM: 2, AL: 1 });
    const ym = agg.find((l) => l.size === 'YM')!;
    const al = agg.find((l) => l.size === 'AL')!;
    record('pure: aggregate order (participants + extras)', ym.total === 4 && al.total === 4 && agg[0].size === 'YM', `YM ${ym.total}, AL ${al.total}`);
    record('pure: jersey number dedup (1st taken -> 2nd)', resolveJerseyNumber([10], 10, 23).assigned === 23 && resolveJerseyNumber([10, 23], 10, 23).assigned === null, 'ok');

    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Gear Verify', programTypeId: league.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    await db.from('programs').update({ base_price_cents: 10000, jersey_numbers_enabled: true, status: 'registration_open' }).eq('id', prog.id);

    // 1. product + variants + offer to program
    productId = await createProduct({ name: 'Team Hoodie', variants: [{ label: 'S', priceCents: 4500 }, { label: 'M', priceCents: 4500 }, { label: 'L', priceCents: 4900 }] }, 'system:verify');
    await offerProduct(prog.id, productId, false, 'system:verify');
    const { data: variants } = await db.from('product_variants').select('id, label, price_cents').eq('product_id', productId).order('sort_order');
    record('product + variants + program offer', (variants ?? []).length === 3 && variants![0].label === 'S', `${(variants ?? []).length} variants`);

    // 2. registrants pick jersey sizes + numbers (no dupes)
    const { data: fam } = await db.from('families').insert({ name: 'Gear Fam' }).select('id').single();
    famId = fam!.id;
    const regIds: number[] = [];
    for (const [name, size] of [['A', 'YM'], ['B', 'YM'], ['C', 'AL']] as const) {
      const { data: m } = await db.from('family_members').insert({ family_id: fam!.id, first_name: name, last_name: 'K', member_role: 'dependent' }).select('id').single();
      const { data: r } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: m!.id, family_id: fam!.id, standing: 'brand_new', status: 'active' }).select('id').single();
      regIds.push(r!.id);
      await setJerseySelection({ registrationId: r!.id, programId: prog.id, size });
    }
    // number assignment: A wants 10, B wants 10 (should fall to 2nd choice 11)
    const a = await setJerseySelection({ registrationId: regIds[0], programId: prog.id, size: 'YM', firstChoice: 10, secondChoice: 12 });
    const b = await setJerseySelection({ registrationId: regIds[1], programId: prog.id, size: 'YM', firstChoice: 10, secondChoice: 11 });
    record('jersey numbers no-dup within team', a.assigned === 10 && b.assigned === 11, `A#${a.assigned}, B#${b.assigned}`);

    // both-taken -> throws
    let blocked = false;
    try { await setJerseySelection({ registrationId: regIds[2], programId: prog.id, size: 'AL', firstChoice: 10, secondChoice: 11 }); } catch { blocked = true; }
    record('both number choices taken -> rejected', blocked, 'ok');

    // 3. aggregated gear order with extras buffer
    await setJerseyExtras(prog.id, { YM: 3, AL: 1 }, 'system:verify');
    const order = await buildGearOrder(prog.id);
    const gYM = order.lines.find((l) => l.size === 'YM')!;
    const gAL = order.lines.find((l) => l.size === 'AL')!;
    record('aggregated supplier order (2 YM + 3 extras, 1 AL + 1)', gYM.total === 5 && gAL.total === 2, `YM ${gYM.total}, AL ${gAL.total}`);

    // 4. add-on folded into order total (program $100 + hoodie $45 = $145)
    const placed = await placeProgramOrder({
      registrationIds: [regIds[0]],
      addons: [{ registrationId: regIds[0], productId, variantId: variants![1].id, label: 'Team Hoodie (M)', priceCents: 4500 }],
      payInFull: true, actorClerkId: 'system:verify',
    });
    orderIds.push(placed.orderId);
    const { data: ord } = await db.from('program_orders').select('total_cents').eq('id', placed.orderId).single();
    const { data: addonRows } = await db.from('order_addons').select('id').eq('order_id', placed.orderId);
    record('add-on folded into order total', ord!.total_cents === 14500 && (addonRows ?? []).length === 1, `total ${ord!.total_cents}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const oid of orderIds) { await db.from('order_addons').delete().eq('order_id', oid); await db.from('program_installments').delete().eq('order_id', oid); await db.from('program_orders').delete().eq('id', oid); }
    if (programId) { await db.from('registrations').delete().eq('program_id', programId); await db.from('program_products').delete().eq('program_id', programId); await db.from('programs').delete().eq('id', programId); }
    if (productId) await db.from('products').delete().eq('id', productId);
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'program, product, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
