import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { placeProgramOrder } from '@/lib/programs/checkout';
import { attachWaiverToProgram, createWaiver, isProgramWaiverSatisfied, signWaiver, updateWaiver } from '@/lib/waivers';

/**
 * DEV-ONLY: Stage-6 program waivers - one per family per program, 1-year
 * validity, version bump re-blocks, checkout gate. Cleaned up.
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
  let waiverId: number | null = null;
  const orderIds: number[] = [];

  try {
    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Waiver Program', programTypeId: league.id, actorClerkId: 'system:verify' });
    programId = prog.id;
    await db.from('programs').update({ base_price_cents: 5000, status: 'registration_open' }).eq('id', prog.id);

    const waiver = await createWaiver({ name: `Program Waiver ${Date.now()}`, body: 'Program terms v1.' }, 'system:verify');
    waiverId = waiver.id;
    await attachWaiverToProgram(prog.id, waiver.id, 'system:verify');

    // family (HoH) + a kid registered
    const { data: hoh } = await db.from('profiles').insert({ clerk_user_id: `pw_${Date.now()}`, email: `pw_${Date.now()}@example.test` }).select('id').single();
    const { data: fam } = await db.from('families').insert({ name: 'Waiver Fam', hoh_profile_id: hoh!.id }).select('id').single();
    famId = fam!.id;
    const { data: m } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'Kid', last_name: 'K', member_role: 'dependent' }).select('id').single();
    const { data: reg } = await db.from('registrations').insert({ program_id: prog.id, family_member_id: m!.id, family_id: fam!.id, standing: 'brand_new', status: 'active' }).select('id').single();

    // 1. unsigned -> not satisfied, checkout blocked
    record('unsigned program waiver not satisfied', !(await isProgramWaiverSatisfied(prog.id, fam!.id)), 'ok');
    let blocked = false;
    try { await placeProgramOrder({ registrationIds: [reg!.id], actorClerkId: 'system:verify' }); } catch (e) { blocked = e instanceof Error && e.message.includes('waiver'); }
    record('checkout blocked until waiver signed', blocked, `blocked=${blocked}`);

    // 2. HoH signs (one per family) -> satisfied, checkout proceeds
    await signWaiver({ waiverId: waiver.id, entityType: 'program', entityId: prog.id, signerName: 'Head Parent', signatureText: 'Head Parent', signerProfileId: hoh!.id });
    record('signed by HoH -> satisfied', await isProgramWaiverSatisfied(prog.id, fam!.id), 'ok');
    const placed = await placeProgramOrder({ registrationIds: [reg!.id], actorClerkId: 'system:verify' });
    orderIds.push(placed.orderId);
    record('checkout proceeds after signing', placed.orderId > 0, `order ${placed.orderId}`);

    // 3. a DIFFERENT family isn't covered by this family's signature
    const { data: hoh2 } = await db.from('profiles').insert({ clerk_user_id: `pw2_${Date.now()}`, email: `pw2_${Date.now()}@example.test` }).select('id').single();
    const { data: fam2 } = await db.from('families').insert({ name: 'Other Fam', hoh_profile_id: hoh2!.id }).select('id').single();
    record('other family still unsatisfied (per-family)', !(await isProgramWaiverSatisfied(prog.id, fam2!.id)), 'ok');
    await db.from('families').delete().eq('id', fam2!.id);
    await db.from('profiles').delete().eq('id', hoh2!.id);

    // 4. version bump re-blocks the family until re-sign
    await updateWaiver(waiver.id, { body: 'Program terms v2 amended.' }, 'system:verify');
    record('body edit re-blocks (stale version)', !(await isProgramWaiverSatisfied(prog.id, fam!.id)), 'ok');

    // 5. expired signature (>365 days) not satisfied
    await db.from('waiver_signatures').update({ signed_at: new Date(Date.now() - 400 * 86400_000).toISOString() }).eq('entity_type', 'program').eq('entity_id', prog.id);
    // (also re-sign at current version but old date to isolate the validity check)
    await db.from('waivers').update({ version: 2 }).eq('id', waiver.id);
    await db.from('waiver_signatures').update({ waiver_version: 2 }).eq('entity_type', 'program').eq('entity_id', prog.id);
    record('1-year validity expiry not satisfied', !(await isProgramWaiverSatisfied(prog.id, fam!.id)), 'ok');
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const oid of orderIds) { await db.from('program_installments').delete().eq('order_id', oid); await db.from('program_orders').delete().eq('id', oid); }
    if (programId) {
      await db.from('waiver_signatures').delete().eq('entity_type', 'program').eq('entity_id', programId);
      await db.from('registrations').delete().eq('program_id', programId);
      await db.from('programs').delete().eq('id', programId);
    }
    if (waiverId) await db.from('waivers').delete().eq('id', waiverId);
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'program, waiver, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
