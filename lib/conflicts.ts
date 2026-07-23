import 'server-only';
import {
  ancestorIds,
  audit,
  intervalsOverlap,
  occupiedInterval,
  type FacilityNode,
} from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking, type BookingRecord } from '@/lib/bookings';

/**
 * Conflict resolution (Module 2 Stage 3). Conflicts are computed pairs of
 * live bookings whose occupied intervals overlap on the same tree line
 * (same node / ancestor / descendant). The operator resolves each pair:
 *   - override & delete (soft-cancel one side)
 *   - edit one or both (links to the booking editor)
 *   - keep both -> acknowledged pair leaves the queue + a reminder email is
 *     scheduled so the double-booking is not forgotten (spec).
 * Confirmed-vs-quote pairs carry a hint recommending the confirmed side win;
 * the choice stays the operator's.
 */

export interface ConflictPair {
  a: BookingRecord;
  b: BookingRecord;
  /** 'same-node' or the ancestor/descendant line between the two facilities. */
  relation: 'same-node' | 'tree-line';
  /** Present when exactly one side is confirmed (spec's resolution hint). */
  hint: string | null;
  acknowledged: boolean;
}

const COLS =
  'id, facility_id, starts_at, ends_at, source, status, is_internal, title, logo_url, show_on_public_schedule, source_ref, setup_minutes, cleanup_minutes, series_id, canceled_at';

/** All unresolved (and optionally acknowledged) conflict pairs in a window. */
export async function findConflictPairs(
  from: string,
  to: string,
  opts: { includeAcknowledged?: boolean } = {},
): Promise<ConflictPair[]> {
  const db = supabaseAdmin();
  const [{ data: fac, error: fErr }, { data: bks, error: bErr }, { data: acks, error: aErr }] =
    await Promise.all([
      db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
      db.from('bookings').select(COLS).is('canceled_at', null).lt('starts_at', to).gt('ends_at', from).order('starts_at'),
      db.from('booking_conflict_acks').select('booking_a, booking_b'),
    ]);
  if (fErr || bErr || aErr) throw new Error((fErr ?? bErr ?? aErr)!.message);

  const tree = (fac ?? []) as FacilityNode[];
  const bookings = (bks ?? []) as BookingRecord[];
  const acked = new Set((acks ?? []).map((x) => `${x.booking_a}:${x.booking_b}`));

  // Ancestor chains once per facility (pairwise checks then O(1) lookups).
  const chains = new Map<number, Set<number>>();
  const chainOf = (id: number) => {
    if (!chains.has(id)) chains.set(id, new Set(ancestorIds(tree, id)));
    return chains.get(id)!;
  };

  const pairs: ConflictPair[] = [];
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const A = bookings[i], B = bookings[j];
      const sameNode = A.facility_id === B.facility_id;
      const treeLine =
        !sameNode &&
        (chainOf(A.facility_id).has(B.facility_id) || chainOf(B.facility_id).has(A.facility_id));
      if (!sameNode && !treeLine) continue;

      const ia = occupiedInterval(A);
      const ib = occupiedInterval(B);
      if (!intervalsOverlap(ia.startMs, ia.endMs, ib.startMs, ib.endMs)) continue;

      const key = `${Math.min(A.id, B.id)}:${Math.max(A.id, B.id)}`;
      const acknowledged = acked.has(key);
      if (acknowledged && !opts.includeAcknowledged) continue;

      const oneConfirmed =
        (A.status === 'confirmed') !== (B.status === 'confirmed')
          ? (A.status === 'confirmed' ? A : B)
          : null;
      pairs.push({
        a: A,
        b: B,
        relation: sameNode ? 'same-node' : 'tree-line',
        hint: oneConfirmed
          ? `"${oneConfirmed.title}" is confirmed - recommend resolving in its favor.`
          : null,
        acknowledged,
      });
    }
  }
  return pairs;
}

/** Override & delete: soft-cancel the losing side (audited by cancelBooking). */
export async function resolveByCancel(loserBookingId: number, actorClerkId: string): Promise<void> {
  await cancelBooking(loserBookingId, actorClerkId, 'conflict resolution: override & delete');
}

/**
 * Keep both: acknowledge the pair (drops it from the queue) and schedule the
 * spec's reminder email about the unresolved double-booking.
 */
export async function keepBoth(
  bookingIdA: number,
  bookingIdB: number,
  actorClerkId: string,
  opts: { remindInHours?: number; note?: string } = {},
): Promise<void> {
  const [a, b] = bookingIdA < bookingIdB ? [bookingIdA, bookingIdB] : [bookingIdB, bookingIdA];
  const reminderAt = new Date(Date.now() + (opts.remindInHours ?? 24) * 3600_000).toISOString();
  const { error } = await supabaseAdmin()
    .from('booking_conflict_acks')
    .upsert(
      { booking_a: a, booking_b: b, acknowledged_by: actorClerkId, note: opts.note ?? null, reminder_at: reminderAt },
      { onConflict: 'booking_a,booking_b' },
    );
  if (error) throw new Error(`keep-both ack failed: ${error.message}`);
  await audit({
    actorId: actorClerkId,
    action: 'conflict.kept-both',
    target: `bookings:${a}+${b}`,
    meta: { reminder_at: reminderAt, note: opts.note },
  });
}

/**
 * Send due keep-both reminders (called by the cron route). Skips pairs where
 * either side has since been canceled.
 */
export async function processConflictReminders(operatorEmail: string): Promise<{ sent: number; skipped: number }> {
  const db = supabaseAdmin();
  const { data: due, error } = await db
    .from('booking_conflict_acks')
    .select('id, booking_a, booking_b, note')
    .lte('reminder_at', new Date().toISOString())
    .is('reminded_at', null);
  if (error) throw new Error(error.message);

  let sent = 0, skipped = 0;
  for (const ack of due ?? []) {
    const { data: pair } = await db
      .from('bookings')
      .select('id, title, starts_at, canceled_at')
      .in('id', [ack.booking_a, ack.booking_b]);
    const live = (pair ?? []).filter((x) => !x.canceled_at);
    if (live.length < 2) {
      // One side already resolved elsewhere - nothing left to nag about.
      await db.from('booking_conflict_acks').update({ reminded_at: new Date().toISOString() }).eq('id', ack.id);
      skipped++;
      continue;
    }
    const [x, y] = live;
    const res = await notify({
      to: { email: operatorEmail },
      channels: ['email'],
      template: 'generic',
      data: {
        heading: 'Unresolved double-booking',
        body: `"${x.title}" and "${y.title}" are still double-booked (kept-both on review${ack.note ? ` - note: ${ack.note}` : ''}). Starts ${new Date(x.starts_at).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}.`,
        ctaLabel: 'Open conflicts queue',
        ctaUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca'}/conflicts`,
      },
    });
    await db.from('booking_conflict_acks').update({ reminded_at: new Date().toISOString() }).eq('id', ack.id);
    res.ok ? sent++ : skipped++;
  }
  return { sent, skipped };
}
