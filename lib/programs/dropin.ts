import 'server-only';
import { audit, price, torontoToday } from '@ai/foundation';
import { must, ok, supabaseAdmin } from '@ai/foundation/supabase';
import { createOrderForRegistration } from '@/lib/programs/orders';

/**
 * Drop-in registration (Module 10 Stage 2). The distinct General-Programs flow:
 * a registrant multi-selects specific dated sessions and pays per session.
 * Per-session capacity greys out full dates. Buying more dates later reuses the
 * SAME registration (purchases accumulate under it) rather than re-registering.
 *
 * Clinics + Pickup need nothing here - they are plain Module 4 framework
 * programs sold as a weekly-session block via Module 2 recurrence.
 */

export interface DropInSessionView {
  id: number;
  session_date: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  capacity: number | null;
  taken: number;
  spots_left: number | null;
  full: boolean;
  postponed: boolean;
}

/** Purchases counted against a session's capacity. */
async function takenFor(sessionId: number): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('dropin_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  return count ?? 0;
}

/** Available dated sessions for a drop-in program, with per-session fullness. */
export async function listSessions(programId: number): Promise<DropInSessionView[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('dropin_sessions')
    .select('id, session_date, starts_at, ends_at, price_cents, capacity, postponed')
    .eq('program_id', programId)
    .order('starts_at');
  if (error) throw new Error(error.message);

  const out: DropInSessionView[] = [];
  for (const s of data ?? []) {
    const taken = await takenFor(s.id);
    const spotsLeft = s.capacity == null ? null : Math.max(0, s.capacity - taken);
    out.push({
      ...s,
      taken,
      spots_left: spotsLeft,
      // A postponed or capacity-full date is unselectable in the picker.
      full: s.postponed || (spotsLeft !== null && spotsLeft <= 0),
    });
  }
  return out;
}

/** The one registration a member holds for a drop-in program (open, not cancelled). */
async function getOrCreateRegistration(
  db: ReturnType<typeof supabaseAdmin>,
  programId: number,
  familyMemberId: number,
  familyId: number | null,
  actorClerkId: string,
): Promise<number> {
  const { data: existing } = await db
    .from('registrations')
    .select('id')
    .eq('program_id', programId)
    .eq('family_member_id', familyMemberId)
    .in('status', ['active', 'waitlisted'])
    .maybeSingle();
  if (existing) return existing.id;

  // Drop-in capacity is per SESSION (checked in purchaseSessions), not per program.
  const { createRegistration } = await import('@/lib/programs/registration');
  const res = await createRegistration({
    programId, familyMemberId, familyId, actorClerkId,
    capacity: { scope: 'none' },
    auditAction: 'dropin.registered',
  });
  return res.registrationId;
}

export interface PurchaseResult {
  registrationId: number;
  purchasedSessionIds: number[];
  totalCents: number;
}

/**
 * Purchase the selected dated sessions for a member. Re-uses the member's
 * existing registration for this program if one exists (buy-more-later keeps a
 * single registration). Rejects sessions that are full or postponed. Prices
 * per session through the Module 1 pricing function.
 */
export async function purchaseSessions(input: {
  programId: number;
  familyMemberId: number;
  familyId: number | null;
  sessionIds: number[];
  actorClerkId: string;
}): Promise<PurchaseResult> {
  const db = supabaseAdmin();
  if (input.sessionIds.length === 0) throw new Error('Select at least one session.');

  // Only a program that is open for registration sells dates — a draft or
  // archived program's sessions are not purchasable by id.
  const program = must(await db.from('programs').select('status').eq('id', input.programId).maybeSingle(), 'program.read');
  if (!['published', 'registration_open', 'full'].includes(program.status)) throw new Error('Registration is not open for this program.');

  const { data: sessions, error } = await db
    .from('dropin_sessions')
    .select('id, price_cents, capacity, postponed')
    .eq('program_id', input.programId)
    .in('id', input.sessionIds);
  if (error) throw new Error(error.message);
  if ((sessions ?? []).length !== input.sessionIds.length) throw new Error('One or more sessions were not found.');

  const registrationId = await getOrCreateRegistration(db, input.programId, input.familyMemberId, input.familyId, input.actorClerkId);

  // Skip dates already owned (idempotent buy-more), enforce per-session capacity.
  const { data: owned } = await db.from('dropin_purchases').select('session_id').eq('registration_id', registrationId);
  const ownedSet = new Set((owned ?? []).map((o) => o.session_id));

  const toBuy: Array<{ id: number; price_cents: number }> = [];
  for (const s of sessions!) {
    if (ownedSet.has(s.id)) continue;
    if (s.postponed) throw new Error(`Session ${s.id} is being rescheduled and cannot be booked.`);
    if (s.capacity != null && (await takenFor(s.id)) >= s.capacity) throw new Error(`Session ${s.id} is full.`);
    toBuy.push({ id: s.id, price_cents: s.price_cents });
  }
  if (toBuy.length === 0) return { registrationId, purchasedSessionIds: [], totalCents: 0 };

  const priced = price(
    toBuy.map((s) => ({ id: `dropin:${s.id}`, kind: 'program', programType: 'general', basePriceCents: s.price_cents })),
  );

  const { error: pErr } = await db
    .from('dropin_purchases')
    .insert(toBuy.map((s) => ({ registration_id: registrationId, session_id: s.id })));
  if (pErr) throw new Error(`purchase failed: ${pErr.message}`);

  // The receivable: one payment due today. Buy-more-later accumulates on the
  // same registration but each purchase is its own order line for /account/pay.
  if (priced.totalCents > 0) {
    await createDropInOrder(registrationId, input.familyId, priced.totalCents, input.actorClerkId, toBuy.map((s) => s.id));
  }

  await audit({
    actorId: input.actorClerkId,
    action: 'dropin.purchased',
    target: `registration:${registrationId}`,
    meta: { program: input.programId, sessions: toBuy.map((s) => s.id), totalCents: priced.totalCents },
  });
  return { registrationId, purchasedSessionIds: toBuy.map((s) => s.id), totalCents: priced.totalCents };
}

/**
 * Each drop-in purchase is billed as its own installment. The registration's
 * first purchase creates the order; later purchases append installments to it
 * so the family sees one running drop-in balance per program.
 */
async function createDropInOrder(registrationId: number, familyId: number | null, totalCents: number, actorClerkId: string, sessionIds: number[]): Promise<void> {
  const db = supabaseAdmin();
  const reg = must(await db.from('registrations').select('order_id').eq('id', registrationId).maybeSingle(), 'registration.read');
  const today = torontoToday();
  if (!reg.order_id) {
    await createOrderForRegistration({
      registrationId,
      familyId,
      totalCents,
      schedule: [{ label: `Drop-in sessions (${sessionIds.length})`, amountCents: totalCents, dueDate: today }],
      actorClerkId,
      source: `dropin:${sessionIds.join(',')}`,
    });
    return;
  }
  const { count } = await db.from('program_installments').select('id', { count: 'exact', head: true }).eq('order_id', reg.order_id);
  ok(
    await db.from('program_installments').insert({ order_id: reg.order_id, seq: (count ?? 0) + 1, label: `Drop-in sessions (${sessionIds.length})`, amount_cents: totalCents, due_date: today }),
    'dropin.installment',
  );
  const order = must(await db.from('program_orders').select('total_cents, subtotal_cents').eq('id', reg.order_id).maybeSingle(), 'order.read');
  ok(
    await db.from('program_orders').update({ total_cents: order.total_cents + totalCents, subtotal_cents: order.subtotal_cents + totalCents }).eq('id', reg.order_id),
    'order.total',
  );
  const { recalculateOwed } = await import('@/lib/programs/checkout');
  await recalculateOwed(reg.order_id);
}
