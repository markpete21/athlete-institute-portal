import 'server-only';
import { HOLD_MINUTES, audit, spotsRemaining } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { deriveStandingFor } from '@/lib/programs/programs';

/**
 * Registration cart + held spots + waitlist (Module 4 Stage 3).
 *
 * A cart holds spots for 10 minutes while a family registers multiple members
 * across multiple programs. Reserving converts held items to registrations:
 * active if capacity allows, else waitlisted - unless staff override the cap.
 * Payment layers on in Stage 4.
 */

export interface CartItemView {
  id: number;
  program_id: number;
  program_name: string;
  family_member_id: number;
  member_name: string;
  hold_expires_at: string;
  hold_seconds_left: number;
  will_waitlist: boolean;
}

/** Count active registrations in a program. */
async function activeCount(programId: number): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('status', 'active');
  return count ?? 0;
}

/** Count live (non-expired) holds on a program, optionally excluding one cart. */
async function heldCount(programId: number, excludeCartId?: number): Promise<number> {
  let q = supabaseAdmin()
    .from('cart_items')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .gt('hold_expires_at', new Date().toISOString());
  if (excludeCartId) q = q.neq('cart_id', excludeCartId);
  const { count } = await q;
  return count ?? 0;
}

/** Purge expired holds (called opportunistically + by cron). */
export async function releaseExpiredHolds(): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('cart_items')
    .delete()
    .lt('hold_expires_at', new Date().toISOString())
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

export async function getOrCreateCart(ownerProfileId: number | null): Promise<number> {
  const db = supabaseAdmin();
  if (ownerProfileId) {
    const { data: open } = await db.from('carts').select('id').eq('owner_profile_id', ownerProfileId).eq('status', 'open').maybeSingle();
    if (open) return open.id;
  }
  const { data, error } = await db.from('carts').insert({ owner_profile_id: ownerProfileId }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * Add a member+program to the cart with a 10-minute hold. Returns whether this
 * item will waitlist (no capacity) so the UI can warn before checkout.
 */
export async function addToCart(cartId: number, programId: number, familyMemberId: number): Promise<{ willWaitlist: boolean }> {
  const db = supabaseAdmin();
  await releaseExpiredHolds();

  // Already registered (active) guard.
  const { count: already } = await db
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('family_member_id', familyMemberId)
    .eq('status', 'active');
  if (already && already > 0) throw new Error('That member is already registered for this program.');

  const { data: program } = await db.from('programs').select('capacity, status').eq('id', programId).single();
  if (!program) throw new Error('Program not found.');
  if (!['published', 'registration_open', 'full'].includes(program.status)) {
    throw new Error('Registration is not open for this program.');
  }

  const { error } = await db
    .from('cart_items')
    .upsert(
      { cart_id: cartId, program_id: programId, family_member_id: familyMemberId, hold_expires_at: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString() },
      { onConflict: 'cart_id,program_id,family_member_id' },
    );
  if (error) throw new Error(`add to cart failed: ${error.message}`);

  // Seats this cart can fill (capacity minus active regs minus OTHER carts'
  // holds); this cart's own items compete for those seats in add order.
  const [active, otherHolds] = await Promise.all([activeCount(programId), heldCount(programId, cartId)]);
  const seats = spotsRemaining(program.capacity, active, otherHolds);
  const { count: thisCartItems } = await db
    .from('cart_items')
    .select('id', { count: 'exact', head: true })
    .eq('cart_id', cartId)
    .eq('program_id', programId);
  const willWaitlist = seats !== null && (thisCartItems ?? 0) > seats;
  return { willWaitlist };
}

export async function removeCartItem(itemId: number): Promise<void> {
  const { error } = await supabaseAdmin().from('cart_items').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
}

/** Cart contents with live countdown + waitlist projection. */
export async function viewCart(cartId: number): Promise<CartItemView[]> {
  const db = supabaseAdmin();
  await releaseExpiredHolds();
  const { data, error } = await db
    .from('cart_items')
    .select('id, program_id, family_member_id, hold_expires_at, programs(name, capacity), family_members(first_name, last_name)')
    .eq('cart_id', cartId)
    .order('id');
  if (error) throw new Error(error.message);

  // Per-program seats this cart can fill; items compete in add order.
  const seatsByProgram = new Map<number, number | null>();
  const rankByProgram = new Map<number, number>();
  const out: CartItemView[] = [];
  for (const row of data ?? []) {
    const program = row.programs as unknown as { name: string; capacity: number | null };
    const member = row.family_members as unknown as { first_name: string; last_name: string };
    if (!seatsByProgram.has(row.program_id)) {
      const [active, otherHolds] = await Promise.all([activeCount(row.program_id), heldCount(row.program_id, cartId)]);
      seatsByProgram.set(row.program_id, spotsRemaining(program.capacity, active, otherHolds));
    }
    const seats = seatsByProgram.get(row.program_id)!;
    const rank = rankByProgram.get(row.program_id) ?? 0;
    rankByProgram.set(row.program_id, rank + 1);
    out.push({
      id: row.id,
      program_id: row.program_id,
      program_name: program.name,
      family_member_id: row.family_member_id,
      member_name: `${member.first_name} ${member.last_name}`,
      hold_expires_at: row.hold_expires_at,
      hold_seconds_left: Math.max(0, Math.round((Date.parse(row.hold_expires_at) - Date.now()) / 1000)),
      will_waitlist: seats !== null && rank >= seats,
    });
  }
  return out;
}

export interface ReserveResult {
  registrations: Array<{ id: number; program_id: number; family_member_id: number; status: string; waitlist_position: number | null }>;
}

/**
 * Convert the cart's held items to registrations. Active if capacity allows
 * (recomputed per program as items are placed), else waitlisted. staffOverride
 * forces active past the cap. Derives standing + stamps marketing source.
 * Payment is layered in Stage 4; this establishes the roster.
 */
export async function reserveCart(
  cartId: number,
  opts: { familyId?: number | null; marketingSource?: string | null; staffOverride?: boolean; actorClerkId: string },
): Promise<ReserveResult> {
  const db = supabaseAdmin();
  await releaseExpiredHolds();
  const { data: items, error } = await db
    .from('cart_items')
    .select('id, program_id, family_member_id')
    .eq('cart_id', cartId)
    .order('id');
  if (error) throw new Error(error.message);
  if ((items ?? []).length === 0) throw new Error('Your held spots expired — please add them again.');

  // Seats this cart can fill per program (capacity - active - other carts'
  // holds), computed ONCE up front. activeCount is re-read each insert, so we
  // track placements in-loop rather than re-querying (which would double-count).
  const seatsByProgram = new Map<number, number | null>();
  const placedActive = new Map<number, number>();
  for (const item of items!) {
    if (!seatsByProgram.has(item.program_id)) {
      const { data: program } = await db.from('programs').select('capacity').eq('id', item.program_id).single();
      const [active, otherHolds] = await Promise.all([activeCount(item.program_id), heldCount(item.program_id, cartId)]);
      seatsByProgram.set(item.program_id, spotsRemaining(program!.capacity, active, otherHolds));
    }
  }

  const registrations: ReserveResult['registrations'] = [];
  for (const item of items!) {
    const seats = seatsByProgram.get(item.program_id)!; // null = unlimited
    const already = placedActive.get(item.program_id) ?? 0;
    const waitlisted = seats !== null && already >= seats && !opts.staffOverride;

    const standing = await deriveStandingFor(item.family_member_id, item.program_id);
    let waitlistPosition: number | null = null;
    if (waitlisted) {
      const { count } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', item.program_id).eq('status', 'waitlisted');
      waitlistPosition = (count ?? 0) + 1;
    } else {
      placedActive.set(item.program_id, already + 1);
    }

    const { data: reg, error: rErr } = await db
      .from('registrations')
      .insert({
        program_id: item.program_id,
        family_id: opts.familyId ?? null,
        family_member_id: item.family_member_id,
        season_key: null,
        standing,
        status: waitlisted ? 'waitlisted' : 'active',
        cart_id: cartId,
        waitlist_position: waitlistPosition,
        staff_override: opts.staffOverride ?? false,
        marketing_source: opts.marketingSource ?? null,
      })
      .select('id, program_id, family_member_id, status, waitlist_position')
      .single();
    if (rErr) throw new Error(`registration failed: ${rErr.message}`);
    registrations.push(reg);
  }

  await db.from('cart_items').delete().eq('cart_id', cartId);
  await db.from('carts').update({ status: 'converted' }).eq('id', cartId);
  await audit({ actorId: opts.actorClerkId, action: 'cart.reserved', target: `cart:${cartId}`, meta: { count: registrations.length, override: opts.staffOverride ?? false } });
  return { registrations };
}

/**
 * Advance the waitlist for a program when a spot frees (withdrawal/cancel):
 * promote the next waitlisted registration to active and notify them.
 */
export async function advanceWaitlist(programId: number, actorClerkId: string): Promise<number | null> {
  const db = supabaseAdmin();
  const { data: program } = await db.from('programs').select('capacity, name').eq('id', programId).single();
  if (!program?.capacity) return null;
  const active = await activeCount(programId);
  if (active >= program.capacity) return null;

  const { data: next } = await db
    .from('registrations')
    .select('id, family_member_id, family_id')
    .eq('program_id', programId)
    .eq('status', 'waitlisted')
    .order('waitlist_position', { nullsFirst: false })
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!next) return null;

  await db.from('registrations').update({ status: 'active', waitlist_position: null }).eq('id', next.id);
  await audit({ actorId: actorClerkId, action: 'waitlist.advanced', target: `registration:${next.id}`, meta: { program_id: programId } });

  // Notify the HoH if we can find an email.
  if (next.family_id) {
    const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', next.family_id).single();
    if (fam?.hoh_profile_id) {
      const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).single();
      if (prof?.email) {
        await notify({
          to: { email: prof.email },
          channels: ['email'],
          template: 'waitlist.opening',
          data: {
            programName: program.name,
            claimUrl: `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/account`,
            expiresLabel: '48 hours',
          },
        });
      }
    }
  }
  return next.id;
}

/** Withdraw/cancel a registration and advance the waitlist behind it. */
export async function withdrawRegistration(registrationId: number, actorClerkId: string, cancel = false): Promise<void> {
  const db = supabaseAdmin();
  const { data: reg, error } = await db.from('registrations').select('program_id, status').eq('id', registrationId).single();
  if (error) throw new Error(error.message);
  const wasActive = reg.status === 'active';
  await db.from('registrations').update({ status: cancel ? 'cancelled' : 'withdrawn' }).eq('id', registrationId);
  await audit({ actorId: actorClerkId, action: cancel ? 'registration.cancelled' : 'registration.withdrawn', target: `registration:${registrationId}` });
  if (wasActive) await advanceWaitlist(reg.program_id, actorClerkId);
}
