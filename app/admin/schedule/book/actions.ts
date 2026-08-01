'use server';

import { revalidatePath } from 'next/cache';
import { torontoInstant } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { createBooking } from '@/lib/bookings';
import { addRecurringRentalLines, addRentalAddon, addRentalLine, createRental } from '@/lib/rentals/quotes';

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
  /**
   * Recurrence: weekly repeats the line's weekday until a date (a real
   * booking_series, so one instance can be resolved without the rest);
   * dates adds extra specific dates as sibling lines.
   */
  repeat?:
    | { mode: 'weekly'; until: string }
    | { mode: 'dates'; dates: string[] };
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
  /** Payment schedule (rental): deposit due + balance due (Toronto dates). */
  depositDue?: string;
  balanceDue?: string;
  /** Email the customer their quote/invoice link after creating. */
  sendInvoice?: boolean;
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
  /** Payment schedule outcome (rental + book): 'scheduled' or the reason it was skipped. */
  scheduleNote?: string;
  /** Invoice/quote email outcome. */
  sendNote?: string;
  quoteUrl?: string;
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
  // A rental QUOTE may start with no facility lines (price/terms first;
  // facilities and dates get assigned later on the rental screen).
  const noFacilityQuote = payload.kind === 'rental' && payload.intent === 'quote';
  if (payload.lines.length === 0 && !noFacilityQuote) {
    throw new Error('At least one facility/time line is required.');
  }
  payload.lines.forEach((l, i) => {
    assertSlot(l, `Line ${i + 1}`);
    if (l.repeat?.mode === 'weekly') {
      if (!DATE.test(l.repeat.until)) throw new Error(`Line ${i + 1}: repeat needs an until date.`);
      if (l.repeat.until <= l.date) throw new Error(`Line ${i + 1}: repeat-until must be after the start date.`);
    }
    if (l.repeat?.mode === 'dates') {
      if (!l.repeat.dates.length) throw new Error(`Line ${i + 1}: pick at least one extra date.`);
      for (const d of l.repeat.dates) {
        if (!DATE.test(d)) throw new Error(`Line ${i + 1}: invalid extra date.`);
      }
    }
  });
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

  // Persist the intended payment schedule on the rental (quotes carry it
  // until they're booked; book-intent uses it immediately below).
  if (!isInternal && (payload.depositDue || payload.balanceDue)) {
    if (payload.depositDue && !DATE.test(payload.depositDue)) throw new Error('Invalid deposit due date.');
    if (payload.balanceDue && !DATE.test(payload.balanceDue)) throw new Error('Invalid balance due date.');
    const { supabaseAdmin } = await import('@ai/foundation/supabase');
    const { error: dErr } = await supabaseAdmin()
      .from('rentals')
      .update({
        deposit_due_date: payload.depositDue ?? null,
        balance_due_date: payload.balanceDue ?? null,
      })
      .eq('id', rental.id);
    if (dErr) throw new Error(`schedule dates save failed: ${dErr.message}`);
  }

  let conflictCount = 0;
  let warningCount = 0;
  const lineBookingIds: number[] = [];

  let lineCount = 0;
  for (const l of payload.lines) {
    const override = isInternal ? undefined : l.unitRateCents ?? undefined;

    if (l.repeat?.mode === 'weekly') {
      // Weekly series through the Module 2 recurrence engine (DST-correct,
      // per-date conflict reporting, shared booking_series).
      const weekday = new Date(`${l.date}T12:00:00Z`).getUTCDay();
      const res = await addRecurringRentalLines({
        rentalId: rental.id,
        facilityId: l.facilityId,
        rateMode: l.rateMode,
        pattern: { freq: 'weekly', byWeekday: [weekday] },
        startDate: l.date,
        startTime: l.start,
        endTime: l.end,
        until: l.repeat.until,
        rateCentsOverride: override,
        confirm: payload.intent === 'book',
        actorClerkId: actor,
      });
      lineCount += res.lineCount;
      conflictCount += res.conflictedDates.length;
      continue;
    }

    const dates = [l.date, ...(l.repeat?.mode === 'dates' ? l.repeat.dates : [])];
    for (const d of dates) {
      const res = await addRentalLine({
        rentalId: rental.id,
        facilityId: l.facilityId,
        rateMode: l.rateMode,
        startsAt: torontoInstant(d, l.start),
        endsAt: torontoInstant(d, l.end),
        rateCentsOverride: override,
        confirm: payload.intent === 'book',
        actorClerkId: actor,
      });
      lineCount += 1;
      conflictCount += res.conflicts.length;
      warningCount += res.warnings.length + res.closures.length;
      if (res.line.booking_id) lineBookingIds.push(res.line.booking_id);
    }
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

  // Concrete rental bookings start their payment schedule immediately
  // (installments from the stored dates; Stripe invoices go out per due date).
  let scheduleNote: string | undefined;
  if (!isInternal && payload.intent === 'book') {
    try {
      const { markRentalBooked } = await import('@/lib/rentals/payments');
      const res = await markRentalBooked(rental.id, actor);
      scheduleNote = `scheduled (${res.installments.length} installments)`;
    } catch (e) {
      scheduleNote = `not scheduled: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  let sendNote: string | undefined;
  if (!isInternal && payload.sendInvoice) {
    try {
      const { emailQuoteLink } = await import('@/lib/rentals/quotes');
      const res = await emailQuoteLink(rental.id, actor);
      sendNote = res.ok ? `sent to ${payload.contactEmail}` : `send failed: ${res.detail}`;
    } catch (e) {
      sendNote = `send failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  revalidatePath('/schedule');
  revalidatePath('/conflicts');
  revalidatePath('/rentals');

  const playBase = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  return {
    rentalId: rental.id,
    lineCount,
    blockCount: payload.blocks.length,
    conflictCount,
    warningCount,
    scheduleNote,
    sendNote,
    quoteUrl: isInternal ? undefined : `${playBase}/quote/${rental.quote_token}`,
  };
}

/** Quick-add an organization mid-wizard (rep = invoicing contact, no account needed). */
export async function quickAddOrgAction(input: {
  name: string;
  repName?: string;
  repEmail?: string;
  repPhone?: string;
}): Promise<{ id: number; name: string }> {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  const { quickAddOrganization } = await import('@/lib/booking-config');
  const org = await quickAddOrganization(input, session.userId!);
  return { id: org.id, name: org.name };
}
