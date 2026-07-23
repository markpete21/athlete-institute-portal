import 'server-only';
import { audit, wouldCycle, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Facility tree persistence (Module 2 Stage 1). Nodes are soft-deleted only —
 * bookings will FK to them. Cycle prevention runs against the live rows on
 * every move; sibling-name uniqueness is enforced by the DB partial index.
 */

const COLS = 'id, parent_id, name, label, sort_order, bookable, deleted_at';

/** Live (non-deleted) nodes; pass includeDeleted for the editor's trash view. */
export async function listFacilities(includeDeleted = false): Promise<FacilityNode[]> {
  let q = supabaseAdmin().from('facilities').select(COLS).order('sort_order').order('name');
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new Error(`facilities read failed: ${error.message}`);
  return (data ?? []) as FacilityNode[];
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
  patch: { name?: string; label?: string | null; bookable?: boolean },
  actorClerkId: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('facilities')
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.label !== undefined ? { label: patch.label?.trim() || null } : {}),
      ...(patch.bookable !== undefined ? { bookable: patch.bookable } : {}),
    })
    .eq('id', id);
  if (error) throw new Error(`facility update failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'facility.updated', target: `facility:${id}`, meta: patch });
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
