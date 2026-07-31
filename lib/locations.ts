import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Locations = the reporting/accounting dimension (Module 14), distinct from the
 * facility tree. A location maps to a QuickBooks Location; programs tag one
 * directly and facilities bind to one via facilities.location_id, so a booking
 * anywhere in the tree resolves its site by walking up (lib/facilities
 * resolveLocationId).
 */

export interface LocationRow {
  id: number;
  name: string;
  city: string | null;
  qbo_location_id: string | null;
}

const COLS = 'id, name, city, qbo_location_id';

export async function listLocations(): Promise<LocationRow[]> {
  const { data, error } = await supabaseAdmin().from('locations').select(COLS).order('name');
  if (error) throw new Error(`locations read failed: ${error.message}`);
  return (data ?? []) as LocationRow[];
}

export async function createLocation(
  input: { name: string; city?: string | null },
  actorClerkId: string,
): Promise<LocationRow> {
  const { data, error } = await supabaseAdmin()
    .from('locations')
    .insert({ name: input.name.trim(), city: input.city?.trim() || null })
    .select(COLS)
    .single();
  if (error) throw new Error(`location create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'location.created', target: `location:${data.id}`, meta: { name: data.name } });
  return data as LocationRow;
}

export async function updateLocation(
  id: number,
  patch: { name?: string; city?: string | null; qboLocationId?: string | null },
  actorClerkId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('locations')
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.city !== undefined ? { city: patch.city?.trim() || null } : {}),
      ...(patch.qboLocationId !== undefined ? { qbo_location_id: patch.qboLocationId?.trim() || null } : {}),
    })
    .eq('id', id);
  if (error) throw new Error(`location update failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'location.updated', target: `location:${id}`, meta: patch });
}
