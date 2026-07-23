import { NextResponse } from 'next/server';
import { spotsRemaining } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { addToCart, getOrCreateCart, releaseExpiredHolds, reserveCart, viewCart, withdrawRegistration } from '@/lib/programs/registration';

/**
 * DEV-ONLY: Stage-3 registration - holds + countdown, capacity->waitlist,
 * multi-member cart fills the last seats, staff override past cap, expired
 * holds release, waitlist advances on withdrawal. Cleaned up.
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
  const memberIds: number[] = [];
  const cartIds: number[] = [];

  try {
    record('pure: spotsRemaining', spotsRemaining(2, 1, 0) === 1 && spotsRemaining(2, 1, 1) === 0 && spotsRemaining(null, 99, 99) === null, 'ok');

    const type = (await listProgramTypes()).find((t) => t.key === 'clinic')!;
    const prog = await createProgram({ name: 'Reg Verify Clinic', programTypeId: type.id, capacity: 2, actorClerkId: 'system:verify' });
    programId = prog.id;
    await db.from('programs').update({ status: 'registration_open' }).eq('id', prog.id);

    // A family with 3 kids
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `reg_${Date.now()}`, email: `reg_${Date.now()}@example.test` }).select('id').single();
    const { data: fam } = await db.from('families').insert({ name: 'Reg Verify', hoh_profile_id: prof!.id }).select('id').single();
    famId = fam!.id;
    for (const n of ['A', 'B', 'C']) {
      const { data: m } = await db.from('family_members').insert({ family_id: fam!.id, first_name: n, last_name: 'Kid', member_role: 'dependent' }).select('id').single();
      memberIds.push(m!.id);
    }

    // 1. cart holds + countdown
    const cart = await getOrCreateCart(prof!.id);
    cartIds.push(cart);
    const add1 = await addToCart(cart, prog.id, memberIds[0]);
    const add2 = await addToCart(cart, prog.id, memberIds[1]);
    record('hold within capacity (no waitlist projected)', !add1.willWaitlist && !add2.willWaitlist, 'ok');
    const view = await viewCart(cart);
    record('cart shows countdown ~10 min', view.length === 2 && view[0].hold_seconds_left > 500 && view[0].hold_seconds_left <= 600, `${view[0].hold_seconds_left}s left`);

    // 2. third member projected to waitlist (cap 2, two held)
    const add3 = await addToCart(cart, prog.id, memberIds[2]);
    record('over-capacity item projects waitlist', add3.willWaitlist, 'ok');

    // 3. reserve: first 2 active, 3rd waitlisted (multi-member fills last seats)
    const res = await reserveCart(cart, { familyId: fam!.id, marketingSource: 'Instagram', actorClerkId: 'system:verify' });
    const active = res.registrations.filter((r) => r.status === 'active');
    const waitlisted = res.registrations.filter((r) => r.status === 'waitlisted');
    record('reserve: 2 active + 1 waitlisted (cap respected)', active.length === 2 && waitlisted.length === 1 && waitlisted[0].waitlist_position === 1, `active ${active.length}, wl ${waitlisted.length}`);

    // 4. withdrawal frees a seat -> waitlist #1 auto-advances (do this BEFORE
    //    the override, which would push the program over capacity)
    await withdrawRegistration(active[0].id, 'system:verify');
    const { data: promoted } = await db.from('registrations').select('status').eq('id', waitlisted[0].id).single();
    record('withdrawal advances waitlist', promoted!.status === 'active', `wl reg now ${promoted!.status}`);

    // 5. staff override past cap (program is now full again: B + promoted C)
    const cart2 = await getOrCreateCart(prof!.id);
    cartIds.push(cart2);
    const { data: m4 } = await db.from('family_members').insert({ family_id: fam!.id, first_name: 'D', last_name: 'Kid', member_role: 'dependent' }).select('id').single();
    memberIds.push(m4!.id);
    await addToCart(cart2, prog.id, m4!.id);
    const ov = await reserveCart(cart2, { familyId: fam!.id, staffOverride: true, actorClerkId: 'system:verify' });
    record('staff override forces active past cap', ov.registrations[0].status === 'active', ov.registrations[0].status);

    // 6. expired holds release
    const cart3 = await getOrCreateCart(null);
    cartIds.push(cart3);
    await db.from('cart_items').insert({ cart_id: cart3, program_id: prog.id, family_member_id: memberIds[1], hold_expires_at: new Date(Date.now() - 1000).toISOString() });
    const released = await releaseExpiredHolds();
    record('expired holds released', released >= 1, `${released} released`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (programId) { await db.from('registrations').delete().eq('program_id', programId); await db.from('cart_items').delete().eq('program_id', programId); }
    for (const c of cartIds) await db.from('carts').delete().eq('id', c);
    if (programId) await db.from('programs').delete().eq('id', programId);
    if (famId) await db.from('families').delete().eq('id', famId);
    record('cleanup', true, 'program, registrations, carts, family removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
