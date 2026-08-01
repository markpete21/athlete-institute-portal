'use server';

import { revalidatePath } from 'next/cache';
import { torontoInstant } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { createBooking } from '@/lib/bookings';
import { addRentalAddon, addRentalLine, createRental } from '@/lib/rentals/quotes';

/**
 * The booking wizard's submit. One path for both kinds:
 *  - internal  -> $0 rental (business-unit owned); lines become CONFIRMED
 *                 bookings immediately (addRentalLine handles internal).
 *  - rental    -> priced quote; lines become TENTATIVE slot-holding bookings
 *                 and the operator continues in the rental detail screen.
 * "Block other facilities" rows are plain internal bookings tied back to the
 * rental via source_ref, so cancelling the rental can find them.
 */

export interface WizardLine {
  facilityId: number;
  date: string;   // YYYY-MM-DD (Toronto)
  start: string;  // HH:MM
  end: string;    // HH:MM
  rateMode: 'hourly' | 'full_day';
  /** Override; null/undefined = resolve from the rate card. */
  unitRateCents?: number | null;
}

export interface WizardBlock {
  facilityId: number;
  date: string;
  start: string;
  end: string;
}

export interface WizardPayload {
  kind: 'internal' | 'rental';
  /** book = concrete (lines confirmed); quote = tentative hold (rental only). */
  intent: 'book' | 'quote';
  title: string;
  bookingType: string;
  businessUnitId?: number | null;   // internal: the owning brand/business unit
  organizationId?: number | null;   // rental: known organization
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  depositPct?: number;
  notes?: string;
  showPublic?: boolean;
  lines: WizardLine[];
  addons: Array<{ addonId: number; qty: number }>;
  blocks: WizardBlock[];
}

export interface WizardResult {
  rentalId: number;
  lineCount: number;
  blockCount: number;
  conflictCount: number;
  warningCount: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertSlot(s: { date: string; start: string; end: string }, label: string): void {
  if (!DATE.test(s.date) || !HHMM.test(s.start) || !HHMM.test(s.end)) {
    throw new Error(`${label}: date and HH:MM start/end are required.`);
  }
  if (s.end <= s.start) throw new Error(`${label}: end must be after start.`);
}

export async function bookWizardAction(payload: WizardPayload): Promise<WizardResult> {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  const actor = session.userId!;

  const title = payload.title.trim();
  if (!title) throw new Error('Title is required.');
  if (!payload.bookingType) throw new Error('Booking type is required.');
  if (payload.lines.length === 0) throw new Error('At least one facility/time line is required.');
  payload.lines.forEach((l, i) => assertSlot(l, `Line ${i + 1}`));
  payload.blocks.forEach((b, i) => assertSlot(b, `Block ${i + 1}`));

  const isInternal = payload.kind === 'internal';
  if (payload.intent === 'quote' && isInternal) {
    throw new Error('A quote is a priced hold for a customer — use a rental, or book internal directly.');
  }
  const rental = await createRental({
    title,
    isInternal,
    businessUnitId: isInternal ? payload.businessUnitId ?? null : null,
    bookingType: payload.bookingType,
    organizationId: !isInternal ? payload.organizationId ?? null : null,
    contactName: payload.contactName?.trim() || null,
    contactEmail: payload.contactEmail?.trim() || null,
    contactPhone: payload.contactPhone?.trim() || null,
    notes: payload.notes?.trim() || null,
    depositPct: payload.depositPct ?? 25,
    actorClerkId: actor,
  });

  let conflictCount = 0;
  let warningCount = 0;
  const lineBookingIds: number[] = [];

  for (const l of payload.lines) {
    const res = await addRentalLine({
      rentalId: rental.id,
      facilityId: l.facilityId,
      rateMode: l.rateMode,
      startsAt: torontoInstant(l.date, l.start),
      endsAt: torontoInstant(l.date, l.end),
      rateCentsOverride: isInternal ? undefined : l.unitRateCents ?? undefined,
      confirm: payload.intent === 'book',
      actorClerkId: actor,
    });
    conflictCount += res.conflicts.length;
    warningCount += res.warnings.length + res.closures.length;
    if (res.line.booking_id) lineBookingIds.push(res.line.booking_id);
  }

  for (const a of payload.addons) {
    if (a.qty > 0) await addRentalAddon({ rentalId: rental.id, addonId: a.addonId, qty: a.qty, actorClerkId: actor });
  }

  // Programs/events default public; wizard bookings go through source=rental
  // (default hidden), so an explicit opt-in flips the created bookings.
  if (payload.showPublic && lineBookingIds.length) {
    const { supabaseAdmin } = await import('@ai/foundation/supabase');
    const { error } = await supabaseAdmin()
      .from('bookings')
      .update({ show_on_public_schedule: true })
      .in('id', lineBookingIds);
    if (error) throw new Error(`public flag update failed: ${error.message}`);
  }

  for (const b of payload.blocks) {
    const res = await createBooking({
      facilityId: b.facilityId,
      startsAt: torontoInstant(b.date, b.start),
      endsAt: torontoInstant(b.date, b.end),
      source: 'internal',
      status: 'confirmed',
      isInternal: true,
      title: `Blocked — ${title}`,
      showOnPublicSchedule: false,
      sourceRef: `rental-block:${rental.id}`,
      actorClerkId: actor,
    });
    conflictCount += res.conflicts.length;
    warningCount += res.warnings.length + res.closures.length;
  }

  revalidatePath('/schedule');
  revalidatePath('/conflicts');
  revalidatePath('/rentals');

  return {
    rentalId: rental.id,
    lineCount: payload.lines.length,
    blockCount: payload.blocks.length,
    conflictCount,
    warningCount,
  };
}
