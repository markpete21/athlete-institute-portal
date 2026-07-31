import 'server-only';
import {
  ancestorIds,
  audit,
  wouldCycle,
  type FacilityClosure,
  type FacilityHours,
  type FacilityNode,
  type HoursWindow,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Facility tree persistence (Module 2 Stage 1). Nodes are soft-deleted only —
 * bookings will FK to them. Cycle prevention runs against the live rows on
 * every move; sibling-name uniqueness is enforced by the DB partial index.
 */

/** A facility row as the app reads it: tree fields + hours + reporting site. */
export interface FacilityRow extends FacilityHours {
  location_id?: number | null;
  public_open?: boolean;
}

// Every column the app reads MUST be listed here - a column missing from the
// SELECT silently reads back as undefined rather than erroring.
const COLS =
  'id, parent_id, name, label, sort_order, bookable, deleted_at, hours_open, hours_close, hours_windows, location_id, public_open';

/** Live (non-deleted) nodes; pass includeDeleted for the editor's trash view. */
export async function listFacilities(includeDeleted = false): Promise<FacilityRow[]> {
  let q = supabaseAdmin().from('facilities').select(COLS).order('sort_order').order('name');
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new Error(`facilities read failed: ${error.message}`);
  return (data ?? []) as FacilityRow[];
}

export interface FacilityInput {
  name: string;
  label?: string | null;
  parentId?: number | null;
  bookable?: boolean;
}

export async function createFacility(input: FacilityInput, actorClerkId: string): Promise<FacilityNode> {
  const db = supabaseAdmin();
  // Append at the end of the new sibling group.
  const { data: siblings } = await db
    .from('facilities')
    .select('sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .filter('parent_id', input.parentId == null ? 'is' : 'eq', input.parentId ?? null);
  const nextOrder = ((siblings?.[0]?.sort_order as number | undefined) ?? 0) + 1;

  const { data, error } = await db
    .from('facilities')
    .insert({
      name: input.name.trim(),
      label: input.label?.trim() || null,
      parent_id: input.parentId ?? null,
      bookable: input.bookable ?? true,
      sort_order: nextOrder,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`facility create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.created', target: `facility:${data.id}`, meta: { name: data.name, parent_id: data.parent_id } });
  return data as FacilityNode;
}

export async function updateFacility(
  id: number,
  patch: {
    name?: string;
    label?: string | null;
    bookable?: boolean;
    /** Null clears the override so the node inherits from its nearest ancestor. */
    hoursWindows?: HoursWindow[] | null;
    locationId?: number | null;
  },
  actorClerkId: string,
): Promise<void> {
  if (patch.hoursWindows) assertValidWindows(patch.hoursWindows);
  const { error } = await supabaseAdmin()
    .from('facilities')
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.label !== undefined ? { label: patch.label?.trim() || null } : {}),
      ...(patch.bookable !== undefined ? { bookable: patch.bookable } : {}),
      ...(patch.hoursWindows !== undefined
        ? { hours_windows: patch.hoursWindows?.length ? patch.hoursWindows : null }
        : {}),
      ...(patch.locationId !== undefined ? { location_id: patch.locationId } : {}),
    })
    .eq('id', id);
  if (error) throw new Error(`facility update failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.updated', target: `facility:${id}`, meta: patch });
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reject malformed windows before they reach the availability engine. */
function assertValidWindows(windows: HoursWindow[]): void {
  const seen = new Set<number>();
  for (const w of windows) {
    if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6) {
      throw new Error(`Weekday must be 0-6 (got ${w.weekday}).`);
    }
    if (seen.has(w.weekday)) throw new Error('One window per weekday.');
    seen.add(w.weekday);
    if (!HHMM.test(w.open) || !HHMM.test(w.close)) {
      throw new Error(`Times must be HH:MM (got ${w.open}-${w.close}).`);
    }
    if (w.close <= w.open) {
      throw new Error(`Closing time must be after opening time (got ${w.open}-${w.close}).`);
    }
  }
}

/**
 * The reporting site a node rolls up to: its own location_id, else the nearest
 * ancestor's. This is what lets a Dome Court 2 rental land under "Athlete
 * Institute" in revenue-by-location (and in the QuickBooks Location mapping).
 */
export function resolveLocationId(tree: FacilityRow[], facilityId: number): number | null {
  const byId = new Map(tree.map((n) => [n.id, n]));
  for (const id of [facilityId, ...ancestorIds(tree, facilityId)]) {
    const loc = byId.get(id)?.location_id;
    if (loc != null) return loc;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seasonal / holiday closures
// ---------------------------------------------------------------------------

export async function listClosures(): Promise<FacilityClosure[]> {
  const { data, error } = await supabaseAdmin()
    .from('facility_closures')
    .select('id, facility_id, starts_on, ends_on, reason')
    .order('starts_on');
  if (error) throw new Error(`closures read failed: ${error.message}`);
  return (data ?? []) as FacilityClosure[];
}

export async function createClosure(
  input: { facilityId: number; startsOn: string; endsOn: string; reason?: string | null },
  actorClerkId: string,
): Promise<FacilityClosure> {
  if (input.endsOn < input.startsOn) throw new Error('Closure end date must be on or after the start date.');
  const { data, error } = await supabaseAdmin()
    .from('facility_closures')
    .insert({
      facility_id: input.facilityId,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      reason: input.reason?.trim() || null,
      created_by: actorClerkId,
    })
    .select('id, facility_id, starts_on, ends_on, reason')
    .single();
  if (error) throw new Error(`closure create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.closure-created', target: `facility:${input.facilityId}`, meta: input });
  return data as FacilityClosure;
}

export async function deleteClosure(id: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('facility_closures').delete().eq('id', id);
  if (error) throw new Error(`closure delete failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.closure-deleted', target: `closure:${id}` });
}

/** Re-parent a node (cycle-checked against the live tree). */
export async function moveFacility(id: number, newParentId: number | null, actorClerkId: string): Promise<void> {
  const rows = await listFacilities();
  if (wouldCycle(rows, id, newParentId)) {
    throw new Error('Cannot nest a facility under its own descendant.');
  }
  const { error } = await supabaseAdmin()
    .from('facilities')
    .update({ parent_id: newParentId })
    .eq('id', id);
  if (error) throw new Error(`facility move failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.moved', target: `facility:${id}`, meta: { new_parent_id: newParentId } });
}

/** Swap sort position with the previous/next live sibling. */
export async function reorderFacility(id: number, direction: 'up' | 'down', actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const rows = await listFacilities();
  const node = rows.find((r) => r.id === id);
  if (!node) throw new Error('Facility not found.');
  const siblings = rows
    .filter((r) => r.parent_id === node.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const idx = siblings.findIndex((s) => s.id === id);
  const swapWith = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return; // already at the edge

  // Ensure distinct sort_orders even if seeded equal.
  const a = { id: node.id, sort_order: swapWith.sort_order };
  const b = { id: swapWith.id, sort_order: node.sort_order };
  const fix = a.sort_order === b.sort_order ? 1 : 0;
  const { error: e1 } = await db.from('facilities').update({ sort_order: a.sort_order }).eq('id', a.id);
  const { error: e2 } = await db.from('facilities').update({ sort_order: b.sort_order + fix }).eq('id', b.id);
  if (e1 || e2) throw new Error(`reorder failed: ${(e1 ?? e2)!.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.reordered', target: `facility:${id}`, meta: { direction } });
}

/** Soft-delete a node AND its live descendants (restore brings back the node only). */
export async function softDeleteFacility(id: number, actorClerkId: string): Promise<void> {
  const rows = await listFacilities();
  const { descendantIds } = await import('@ai/foundation');
  const ids = [id, ...descendantIds(rows, id)];
  const { error } = await supabaseAdmin()
    .from('facilities')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw new Error(`facility delete failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.soft-deleted', target: `facility:${id}`, meta: { including_descendants: ids.length - 1 } });
}

export async function restoreFacility(id: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('facilities')
    .update({ deleted_at: null })
    .eq('id', id);
  if (error) throw new Error(`facility restore failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.restored', target: `facility:${id}` });
}
