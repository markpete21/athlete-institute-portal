import 'server-only';
import { audit, price } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { deriveStandingFor } from '@/lib/programs/programs';

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
): Promise<number> {
  const { data: existing } = await db
    .from('registrations')
    .select('id')
    .eq('program_id', programId)
    .eq('family_member_id', familyMemberId)
    .in('status', ['active', 'waitlisted'])
    .maybeSingle();
  if (existing) return existing.id;

  const standing = await deriveStandingFor(familyMemberId, programId);
  const { data, error } = await db
    .from('registrations')
    .insert({ program_id: programId, family_member_id: familyMemberId, family_id: familyId, status: 'active', standing })
    .select('id')
    .single();
  if (error) throw new Error(`registration failed: ${error.message}`);
  return data.id;
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

  const { data: sessions, error } = await db
    .from('dropin_sessions')
    .select('id, price_cents, capacity, postponed')
    .eq('program_id', input.programId)
    .in('id', input.sessionIds);
  if (error) throw new Error(error.message);
  if ((sessions ?? []).length !== input.sessionIds.length) throw new Error('One or more sessions were not found.');

  const registrationId = await getOrCreateRegistration(db, input.programId, input.familyMemberId, input.familyId);

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

  await audit({
    actorId: input.actorClerkId,
    action: 'dropin.purchased',
    target: `registration:${registrationId}`,
    meta: { program: input.programId, sessions: toBuy.map((s) => s.id), totalCents: priced.totalCents },
  });
  return { registrationId, purchasedSessionIds: toBuy.map((s) => s.id), totalCents: priced.totalCents };
}
