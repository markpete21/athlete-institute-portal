import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Admin-editable booking configuration: the type chips the booking wizard
 * (and rentals form) offer, and the business units that own internal
 * bookings. Both are plain data - staff manage them in Rentals > Settings,
 * no deploy needed.
 */

export interface BookingType {
  id: number;
  name: string;
  applies_to: 'internal' | 'rental' | 'both';
  active: boolean;
  sort_order: number;
}

export interface BusinessUnit {
  id: number;
  name: string;
  active: boolean;
}

export async function listBookingTypes(includeInactive = false): Promise<BookingType[]> {
  let q = supabaseAdmin()
    .from('booking_types')
    .select('id, name, applies_to, active, sort_order')
    .order('sort_order')
    .order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`booking types read failed: ${error.message}`);
  return (data ?? []) as BookingType[];
}

export async function upsertBookingType(
  input: { id?: number | null; name: string; appliesTo: BookingType['applies_to']; active?: boolean; sortOrder?: number },
  actorClerkId: string,
): Promise<void> {
  const row = {
    name: input.name.trim().toLowerCase(),
    applies_to: input.appliesTo,
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
  };
  if (!row.name) throw new Error('Type name required.');
  const db = supabaseAdmin();
  const { error } = input.id
    ? await db.from('booking_types').update(row).eq('id', input.id)
    : await db.from('booking_types').insert(row);
  if (error) throw new Error(`booking type save failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'booking-type.saved', target: `booking-type:${input.id ?? row.name}`, meta: row });
}

export async function listBusinessUnits(includeInactive = false): Promise<BusinessUnit[]> {
  let q = supabaseAdmin().from('business_units').select('id, name, active').order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`business units read failed: ${error.message}`);
  return (data ?? []) as BusinessUnit[];
}

export async function upsertBusinessUnit(
  input: { id?: number | null; name: string; active?: boolean },
  actorClerkId: string,
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('Business unit name required.');
  const db = supabaseAdmin();
  const { error } = input.id
    ? await db.from('business_units').update({ name, ...(input.active !== undefined ? { active: input.active } : {}) }).eq('id', input.id)
    : await db.from('business_units').insert({ name });
  if (error) throw new Error(`business unit save failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'business-unit.saved', target: `business-unit:${input.id ?? name}`, meta: { name, active: input.active } });
}
