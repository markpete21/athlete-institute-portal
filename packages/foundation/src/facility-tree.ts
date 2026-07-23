/**
 * Facility tree math (Module 2) — PURE, edge-safe. The availability engine
 * (Stage 2) builds on these walkers; the tree editor uses them for cycle
 * prevention and ordered rendering.
 */

export interface FacilityNode {
  id: number;
  parent_id: number | null;
  name: string;
  label: string | null;
  sort_order: number;
  bookable: boolean;
  deleted_at?: string | null;
}

export interface FacilityTreeNode extends FacilityNode {
  children: FacilityTreeNode[];
  depth: number;
}

/** Rows → ordered forest (children sorted by sort_order, then name). */
export function buildTree(rows: FacilityNode[]): FacilityTreeNode[] {
  const byId = new Map<number, FacilityTreeNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [], depth: 0 });

  const roots: FacilityTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id != null && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: FacilityTreeNode[], depth: number) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    for (const n of nodes) { n.depth = depth; sortRec(n.children, depth + 1); }
  };
  sortRec(roots, 0);
  return roots;
}

/** Depth-first flatten of a forest (render order for the editor). */
export function flattenTree(roots: FacilityTreeNode[]): FacilityTreeNode[] {
  const out: FacilityTreeNode[] = [];
  const walk = (n: FacilityTreeNode) => { out.push(n); n.children.forEach(walk); };
  roots.forEach(walk);
  return out;
}

/** All descendant ids of `id` (not including itself). */
export function descendantIds(rows: FacilityNode[], id: number): number[] {
  const kids = new Map<number | null, number[]>();
  for (const r of rows) kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r.id]);
  const out: number[] = [];
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(kids.get(cur) ?? []));
  }
  return out;
}

/** Ancestor ids of `id`, nearest first (not including itself). */
export function ancestorIds(rows: FacilityNode[], id: number): number[] {
  const parentOf = new Map<number, number | null>();
  for (const r of rows) parentOf.set(r.id, r.parent_id);
  const out: number[] = [];
  let cur = parentOf.get(id) ?? null;
  while (cur != null) {
    out.push(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return out;
}

/** Would re-parenting `id` under `newParentId` create a cycle? */
export function wouldCycle(rows: FacilityNode[], id: number, newParentId: number | null): boolean {
  if (newParentId == null) return false;
  if (newParentId === id) return true;
  return descendantIds(rows, id).includes(newParentId);
}
