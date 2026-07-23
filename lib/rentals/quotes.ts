import 'server-only';
import { randomBytes } from 'node:crypto';
import { ancestorIds, applyPercent, audit, sumCents, withHst, type FacilityNode } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking, createBooking, type AvailabilityReport } from '@/lib/bookings';
import { listRates, resolveRate, type RateMode } from '@/lib/rentals/rates';

/**
 * The quote builder core (Module 3 Stage 2).
 *
 * Structure: one rental = many date/time blocks (lines), each line is a
 * facility with its own rate mode; add-ons attach to the whole quote or to a
 * line. Every line creates a TENTATIVE booking through the Module 2 API - the
 * quote holds its slots, and collisions surface in the conflicts queue.
 * Roll-up: subtotal -> HST -> total; deposit = deposit_pct of total.
 */

export interface RentalLine {
  id: number;
  rental_id: number;
  facility_id: number;
  facility_name: string;
  rate_mode: RateMode;
  unit_rate_cents: number;
  starts_at: string;
  ends_at: string;
  line_total_cents: number;
  booking_id: number | null;
  sort_order: number;
}

export interface RentalAddonRow {
  id: number;
  rental_id: number;
  line_id: number | null;
  addon_id: number | null;
  name: string;
  pricing_mode: 'flat' | 'per_unit' | 'per_hour';
  unit_price_cents: number;
  qty: number;
  total_cents: number;
}

export interface Rental {
  id: number;
  title: string;
  status: 'quote' | 'deposit_due' | 'balance_due' | 'overdue' | 'paid' | 'cancelled';
  is_internal: boolean;
  business_unit_id: number | null;
  booking_type: string | null;
  booking_type_other: string | null;
  profile_id: number | null;
  organization_id: number | null;
  family_id: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  deposit_pct: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  quote_token: string;
  waiver_id: number | null;
  lines: RentalLine[];
  addons: RentalAddonRow[];
}

const R_COLS =
  'id, title, status, is_internal, business_unit_id, booking_type, booking_type_other, profile_id, organization_id, family_id, contact_name, contact_email, contact_phone, notes, deposit_pct, subtotal_cents, tax_cents, total_cents, deposit_cents, quote_token, waiver_id';
const L_COLS =
  'id, rental_id, facility_id, facility_name, rate_mode, unit_rate_cents, starts_at, ends_at, line_total_cents, booking_id, sort_order';
const A_COLS = 'id, rental_id, line_id, addon_id, name, pricing_mode, unit_price_cents, qty, total_cents';

// ---------------------------------------------------------------------------
// Pure math (unit-tested via the verify route)
// ---------------------------------------------------------------------------

export function hoursBetween(startsAt: string, endsAt: string): number {
  return (Date.parse(endsAt) - Date.parse(startsAt)) / 3600_000;
}

/** A line's total from its rate mode. Hourly = exact fractional hours. */
export function lineTotalCents(mode: RateMode, unitRateCents: number, startsAt: string, endsAt: string): number {
  if (mode === 'hourly') return Math.round(unitRateCents * hoursBetween(startsAt, endsAt));
  return unitRateCents; // full_day / flat: the rate IS the block total
}

/** An add-on's total. per_hour needs the hours of its attached line (or qty as hours when global). */
export function addonTotalCents(
  mode: 'flat' | 'per_unit' | 'per_hour',
  unitPriceCents: number,
  qty: number,
  attachedLineHours: number | null,
): number {
  if (mode === 'flat') return unitPriceCents;
  if (mode === 'per_unit') return Math.round(unitPriceCents * qty);
  const hours = attachedLineHours ?? qty;
  return Math.round(unitPriceCents * hours);
}

export interface Rollup {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
}

/** subtotal -> HST -> total; deposit = pct of total; internal rentals are $0. */
export function rollup(
  lines: Array<{ line_total_cents: number }>,
  addons: Array<{ total_cents: number }>,
  depositPct: number,
  isInternal: boolean,
): Rollup {
  if (isInternal) return { subtotal_cents: 0, tax_cents: 0, total_cents: 0, deposit_cents: 0, balance_cents: 0 };
  const subtotal = sumCents([...lines.map((l) => l.line_total_cents), ...addons.map((a) => a.total_cents)]);
  const { taxCents, totalCents } = withHst(subtotal);
  const deposit = applyPercent(totalCents, depositPct);
  return {
    subtotal_cents: subtotal,
    tax_cents: taxCents,
    total_cents: totalCents,
    deposit_cents: deposit,
    balance_cents: totalCents - deposit,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function recomputeTotals(rentalId: number): Promise<void> {
  const db = supabaseAdmin();
  const [{ data: rental }, { data: lines }, { data: addons }] = await Promise.all([
    db.from('rentals').select('deposit_pct, is_internal').eq('id', rentalId).single(),
    db.from('rental_lines').select('line_total_cents').eq('rental_id', rentalId),
    db.from('rental_line_addons').select('total_cents').eq('rental_id', rentalId),
  ]);
  const r = rollup((lines ?? []) as never[], (addons ?? []) as never[], rental!.deposit_pct, rental!.is_internal);
  const { error } = await db
    .from('rentals')
    .update({
      subtotal_cents: r.subtotal_cents,
      tax_cents: r.tax_cents,
      total_cents: r.total_cents,
      deposit_cents: r.deposit_cents,
    })
    .eq('id', rentalId);
  if (error) throw new Error(`rollup persist failed: ${error.message}`);
}

export interface CreateRentalInput {
  title: string;
  isInternal?: boolean;
  businessUnitId?: number | null;
  bookingType?: string | null;
  bookingTypeOther?: string | null;
  profileId?: number | null;
  organizationId?: number | null;
  familyId?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  depositPct?: number;
  actorClerkId: string;
}

export async function createRental(input: CreateRentalInput): Promise<Rental> {
  const { data, error } = await supabaseAdmin()
    .from('rentals')
    .insert({
      title: input.title.trim(),
      is_internal: input.isInternal ?? false,
      business_unit_id: input.businessUnitId ?? null,
      booking_type: input.bookingType ?? null,
      booking_type_other: input.bookingTypeOther ?? null,
      profile_id: input.profileId ?? null,
      organization_id: input.organizationId ?? null,
      family_id: input.familyId ?? null,
      contact_name: input.contactName ?? null,
      contact_email: input.contactEmail ?? null,
      contact_phone: input.contactPhone ?? null,
      notes: input.notes ?? null,
      deposit_pct: input.depositPct ?? 25,
      quote_token: randomBytes(18).toString('base64url'),
      created_by: input.actorClerkId,
    })
    .select(R_COLS)
    .single();
  if (error) throw new Error(`rental create failed: ${error.message}`);
  await audit({ actorId: input.actorClerkId, action: 'rental.created', target: `rental:${data.id}`, meta: { title: input.title, internal: input.isInternal ?? false } });
  return { ...(data as Omit<Rental, 'lines' | 'addons'>), lines: [], addons: [] };
}

/**
 * Add a date/time block. Resolves the facility's default rate for the mode
 * (overridable), creates the slot-holding TENTATIVE booking via Module 2, and
 * returns the availability report so the builder UI can surface conflicts.
 */
export async function addRentalLine(input: {
  rentalId: number;
  facilityId: number;
  rateMode: RateMode;
  startsAt: string;
  endsAt: string;
  rateCentsOverride?: number;
  actorClerkId: string;
}): Promise<{ line: RentalLine } & AvailabilityReport> {
  const db = supabaseAdmin();
  const [{ data: rental }, { data: facRows }, rates] = await Promise.all([
    db.from('rentals').select('id, title, is_internal, family_id, status').eq('id', input.rentalId).single(),
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    listRates(),
  ]);
  if (!rental) throw new Error('Rental not found.');
  if (rental.status === 'cancelled') throw new Error('Rental is cancelled.');
  const tree = (facRows ?? []) as FacilityNode[];
  const facility = tree.find((f) => f.id === input.facilityId);
  if (!facility) throw new Error('Facility not found.');

  // Internal bookings are $0 (scheduling only) - no rate required.
  const chain = [input.facilityId, ...ancestorIds(tree, input.facilityId)];
  const rate = rental.is_internal
    ? 0
    : input.rateCentsOverride ?? resolveRate(rates, chain, input.rateMode);
  if (rate == null) throw new Error(`No ${input.rateMode} rate configured for "${facility.name}" (set one in Rental settings or override).`);

  // The quote HOLDS the slot: tentative booking through the Module 2 contract.
  const created = await createBooking({
    facilityId: input.facilityId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    source: 'rental',
    status: rental.is_internal ? 'confirmed' : 'tentative',
    title: rental.title,
    isInternal: rental.is_internal,
    familyId: rental.family_id,
    sourceRef: `rental:${input.rentalId}`,
    actorClerkId: input.actorClerkId,
  });

  const total = rental.is_internal ? 0 : lineTotalCents(input.rateMode, rate, input.startsAt, input.endsAt);
  const { data: line, error } = await db
    .from('rental_lines')
    .insert({
      rental_id: input.rentalId,
      facility_id: input.facilityId,
      facility_name: facility.name,
      rate_mode: input.rateMode,
      unit_rate_cents: rental.is_internal ? 0 : rate,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      line_total_cents: total,
      booking_id: created.booking.id,
    })
    .select(L_COLS)
    .single();
  if (error) throw new Error(`line create failed: ${error.message}`);

  await recomputeTotals(input.rentalId);
  return { line: line as RentalLine, available: created.available, conflicts: created.conflicts, warnings: created.warnings };
}

export async function removeRentalLine(lineId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: line, error } = await db.from('rental_lines').select('id, rental_id, booking_id').eq('id', lineId).single();
  if (error) throw new Error(error.message);
  if (line.booking_id) await cancelBooking(line.booking_id, actorClerkId, 'rental line removed');
  await db.from('rental_line_addons').delete().eq('line_id', lineId);
  const { error: e2 } = await db.from('rental_lines').delete().eq('id', lineId);
  if (e2) throw new Error(e2.message);
  await recomputeTotals(line.rental_id);
}

export async function addRentalAddon(input: {
  rentalId: number;
  addonId: number;
  lineId?: number | null;
  qty?: number;
  priceCentsOverride?: number;
  actorClerkId: string;
}): Promise<RentalAddonRow> {
  const db = supabaseAdmin();
  const { data: addon, error: aErr } = await db
    .from('rental_addons_catalog')
    .select('id, name, pricing_mode, default_price_cents')
    .eq('id', input.addonId)
    .single();
  if (aErr) throw new Error(aErr.message);

  let lineHours: number | null = null;
  if (input.lineId) {
    const { data: line } = await db.from('rental_lines').select('starts_at, ends_at').eq('id', input.lineId).single();
    if (line) lineHours = hoursBetween(line.starts_at, line.ends_at);
  }

  const price = input.priceCentsOverride ?? addon.default_price_cents;
  const qty = input.qty ?? 1;
  const { data, error } = await db
    .from('rental_line_addons')
    .insert({
      rental_id: input.rentalId,
      line_id: input.lineId ?? null,
      addon_id: addon.id,
      name: addon.name,
      pricing_mode: addon.pricing_mode,
      unit_price_cents: price,
      qty,
      total_cents: addonTotalCents(addon.pricing_mode, price, qty, lineHours),
    })
    .select(A_COLS)
    .single();
  if (error) throw new Error(`addon add failed: ${error.message}`);
  await recomputeTotals(input.rentalId);
  return data as RentalAddonRow;
}

export async function removeRentalAddon(addonRowId: number): Promise<void> {
  const db = supabaseAdmin();
  const { data: row, error } = await db.from('rental_line_addons').select('rental_id').eq('id', addonRowId).single();
  if (error) throw new Error(error.message);
  await db.from('rental_line_addons').delete().eq('id', addonRowId);
  await recomputeTotals(row.rental_id);
}

async function hydrate(rentalRow: Omit<Rental, 'lines' | 'addons'>): Promise<Rental> {
  const db = supabaseAdmin();
  const [{ data: lines }, { data: addons }] = await Promise.all([
    db.from('rental_lines').select(L_COLS).eq('rental_id', rentalRow.id).order('sort_order').order('starts_at'),
    db.from('rental_line_addons').select(A_COLS).eq('rental_id', rentalRow.id).order('id'),
  ]);
  return { ...rentalRow, lines: (lines ?? []) as RentalLine[], addons: (addons ?? []) as RentalAddonRow[] };
}

export async function getRental(id: number): Promise<Rental | null> {
  const { data, error } = await supabaseAdmin().from('rentals').select(R_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? hydrate(data as Omit<Rental, 'lines' | 'addons'>) : null;
}

/** The public online-quote view (the emailed link). */
export async function getRentalByToken(token: string): Promise<Rental | null> {
  const { data, error } = await supabaseAdmin().from('rentals').select(R_COLS).eq('quote_token', token).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? hydrate(data as Omit<Rental, 'lines' | 'addons'>) : null;
}

/** Email the customer their online quote link (brand-themed via notify()). */
export async function emailQuoteLink(rentalId: number, actorClerkId: string): Promise<{ ok: boolean; detail: string }> {
  const rental = await getRental(rentalId);
  if (!rental) throw new Error('Rental not found.');
  if (!rental.contact_email) throw new Error('No contact email on this rental.');
  const url = `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/quote/${rental.quote_token}`;
  const res = await notify({
    to: { email: rental.contact_email },
    channels: ['email'],
    template: 'generic',
    data: {
      heading: `Your Athlete Institute quote: ${rental.title}`,
      body: `Hi ${rental.contact_name ?? ''}, your rental quote is ready. View the details, dates and payment breakdown online - and reach out with any questions.`,
      ctaLabel: 'View your quote',
      ctaUrl: url,
    },
  });
  await audit({ actorId: actorClerkId, action: 'rental.quote-emailed', target: `rental:${rentalId}`, meta: { to: rental.contact_email } });
  return { ok: res.ok, detail: res.results[0]?.detail ?? 'sent' };
}
