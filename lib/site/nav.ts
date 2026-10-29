import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * The header menu tree (Module 23 §2.3, §6.1). Depth rule: root > folder >
 * folder > page/link at most. Enforced here, in the editor, and by the DB
 * trigger from migration 0064.
 */

export type NavKind = 'page' | 'folder' | 'link';

export interface NavItem {
  id: number;
  parentId: number | null;
  kind: NavKind;
  label: string;
  pageId: number | null;
  href: string | null;
  newTab: boolean;
  description: string | null;
  imageUrl: string | null;
  featured: boolean;
  sortOrder: number;
  visible: boolean;
  meta: { soon?: boolean; sport?: string; note?: string };
  children: NavItem[];
}

const COLS = 'id, parent_id, kind, label, page_id, href, new_tab, description, image_url, featured, sort_order, visible, meta';

function toItem(r: Record<string, unknown>): NavItem {
  return {
    id: r.id as number, parentId: (r.parent_id as number) ?? null, kind: r.kind as NavKind, label: r.label as string,
    pageId: (r.page_id as number) ?? null, href: (r.href as string) ?? null, newTab: !!r.new_tab, description: (r.description as string) ?? null,
    imageUrl: (r.image_url as string) ?? null, featured: !!r.featured, sortOrder: (r.sort_order as number) ?? 100, visible: r.visible !== false,
    meta: (r.meta as NavItem['meta']) ?? {}, children: [],
  };
}

export function buildTree(rows: NavItem[]): NavItem[] {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as NavItem[] }]));
  const roots: NavItem[] = [];
  for (const r of byId.values()) {
    if (r.parentId && byId.has(r.parentId)) byId.get(r.parentId)!.children.push(r);
    else roots.push(r);
  }
  const sortRec = (list: NavItem[]) => { list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id); list.forEach((i) => sortRec(i.children)); };
  sortRec(roots);
  return roots;
}

/** The full tree (admin). */
export async function navTree(brandKey: string): Promise<NavItem[]> {
  const { data } = await supabaseAdmin().from('site_nav_items').select(COLS).eq('brand_key', brandKey).order('sort_order').order('id');
  return buildTree((data ?? []).map(toItem));
}

/**
 * The public tree: hidden items removed, page items whose page is unpublished
 * or hidden-from-menu removed, empty folders removed.
 */
export async function publicNav(brandKey: string): Promise<NavItem[]> {
  const db = supabaseAdmin();
  const [{ data: rows }, { data: pages }] = await Promise.all([
    db.from('site_nav_items').select(COLS).eq('brand_key', brandKey).eq('visible', true),
    db.from('site_pages').select('id, blocks_published, hidden_from_menu').eq('brand_key', brandKey),
  ]);
  const okPage = new Set((pages ?? []).filter((p) => p.blocks_published != null && !p.hidden_from_menu).map((p) => p.id));
  const items = (rows ?? []).map(toItem).filter((i) => i.kind !== 'page' || !i.pageId || okPage.has(i.pageId));
  const tree = buildTree(items);
  const prune = (list: NavItem[]): NavItem[] => list.map((i) => ({ ...i, children: prune(i.children) })).filter((i) => i.kind !== 'folder' || i.children.length > 0);
  return prune(tree);
}

export function depthOf(rows: NavItem[], id: number | null): number {
  let d = 0;
  let p = id;
  const byId = new Map(rows.map((r) => [r.id, r]));
  while (p) { d += 1; p = byId.get(p)?.parentId ?? null; if (d > 10) break; }
  return d;
}

function subtreeDepth(item: NavItem): number {
  if (!item.children.length) return 0;
  return 1 + Math.max(...item.children.map(subtreeDepth));
}

import { DEPTH_MESSAGE } from './constants';
export { DEPTH_MESSAGE };

/** Pure check used by the editor action: may `item` sit under `parent`? */
export function canPlace(item: NavItem, parent: NavItem | null): string | null {
  if (!parent) return null;
  if (parent.kind !== 'folder') return 'A menu item can only sit inside a folder.';
  const parentDepth = parent.parentId ? 1 : 0; // parent is root (0) or inside a root folder (1)
  const newDepth = parentDepth + 1;
  if (item.kind === 'folder' && newDepth >= 2) return DEPTH_MESSAGE;
  if (newDepth + subtreeDepth(item) > 2) return DEPTH_MESSAGE;
  return null;
}

export interface NavInput { kind: NavKind; label: string; pageId?: number | null; href?: string | null; newTab?: boolean; description?: string | null; imageUrl?: string | null; featured?: boolean; visible?: boolean; meta?: NavItem['meta']; parentId?: number | null }

export async function addNavItem(brandKey: string, input: NavInput, actorClerkId: string): Promise<NavItem> {
  const db = supabaseAdmin();
  const rows = (await db.from('site_nav_items').select(COLS).eq('brand_key', brandKey)).data?.map(toItem) ?? [];
  const parent = input.parentId ? buildTree(rows).flatMap(function flat(i): NavItem[] { return [i, ...i.children.flatMap(flat)]; }).find((i) => i.id === input.parentId) ?? null : null;
  const err = canPlace({ id: 0, parentId: null, kind: input.kind, label: input.label, pageId: null, href: null, newTab: false, description: null, imageUrl: null, featured: false, sortOrder: 0, visible: true, meta: {}, children: [] }, parent);
  if (err) throw new Error(err);
  const siblings = rows.filter((r) => (r.parentId ?? null) === (input.parentId ?? null));
  const { data, error } = await db.from('site_nav_items').insert({
    brand_key: brandKey, parent_id: input.parentId ?? null, kind: input.kind, label: input.label.trim() || 'New item', page_id: input.pageId ?? null, href: input.href ?? null,
    new_tab: !!input.newTab, description: input.description ?? null, image_url: input.imageUrl ?? null, featured: !!input.featured, visible: input.visible !== false, meta: input.meta ?? {},
    sort_order: (siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) : 0) + 1,
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'nav.save', target: `site:${brandKey}`, meta: { added: input.label } });
  return toItem(data);
}

export async function updateNavItem(brandKey: string, id: number, patch: Partial<NavInput>, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const rows = (await db.from('site_nav_items').select(COLS).eq('brand_key', brandKey)).data?.map(toItem) ?? [];
  const tree = buildTree(rows);
  const all = tree.flatMap(function flat(i): NavItem[] { return [i, ...i.children.flatMap(flat)]; });
  const item = all.find((i) => i.id === id);
  if (!item) throw new Error('Menu item not found.');
  const nextKind = patch.kind ?? item.kind;
  if (nextKind !== 'folder' && item.children.length) throw new Error('Move this folder\'s items out before changing its type.');
  const parent = item.parentId ? all.find((i) => i.id === item.parentId) ?? null : null;
  const err = canPlace({ ...item, kind: nextKind }, parent);
  if (err) throw new Error(err);
  const row: Record<string, unknown> = {};
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.label !== undefined) row.label = patch.label.trim() || item.label;
  if (patch.pageId !== undefined) row.page_id = patch.pageId;
  if (patch.href !== undefined) row.href = patch.href;
  if (patch.newTab !== undefined) row.new_tab = patch.newTab;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
  if (patch.featured !== undefined) row.featured = patch.featured;
  if (patch.visible !== undefined) row.visible = patch.visible;
  if (patch.meta !== undefined) row.meta = patch.meta;
  const { error } = await db.from('site_nav_items').update(row).eq('brand_key', brandKey).eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'nav.save', target: `site:${brandKey}`, meta: { item: id, keys: Object.keys(row) } });
}

/**
 * Move an item: before/after a target, or into a folder. Drag and the
 * Up/Down/Indent/Outdent buttons all end here.
 */
export async function moveNavItem(brandKey: string, id: number, target: { id: number; position: 'before' | 'after' | 'in' } | { parentId: number | null; index: number }, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const rows = (await db.from('site_nav_items').select(COLS).eq('brand_key', brandKey)).data?.map(toItem) ?? [];
  const tree = buildTree(rows);
  const all = tree.flatMap(function flat(i): NavItem[] { return [i, ...i.children.flatMap(flat)]; });
  const item = all.find((i) => i.id === id);
  if (!item) throw new Error('Menu item not found.');
  let parentId: number | null;
  let index: number;
  if ('position' in target) {
    const t = all.find((i) => i.id === target.id);
    if (!t) throw new Error('Target not found.');
    if (all.filter((i) => i.id === target.id).length && item.children.some(function has(c): boolean { return c.id === target.id || c.children.some(has); })) throw new Error('An item can\'t go inside itself.');
    if (target.position === 'in') { parentId = t.id; index = t.children.length; }
    else {
      parentId = t.parentId;
      const sibs = (parentId ? all.find((i) => i.id === parentId)?.children : tree) ?? [];
      const idx = sibs.findIndex((s) => s.id === t.id);
      index = target.position === 'before' ? idx : idx + 1;
    }
  } else {
    parentId = target.parentId; index = target.index;
  }
  if (parentId === item.id) throw new Error('An item can\'t go inside itself.');
  const parent = parentId ? all.find((i) => i.id === parentId) ?? null : null;
  const err = canPlace(item, parent);
  if (err) throw new Error(err);
  const sibs = ((parent ? parent.children : tree).filter((s) => s.id !== item.id));
  sibs.splice(Math.max(0, Math.min(index, sibs.length)), 0, item);
  for (let i = 0; i < sibs.length; i += 1) {
    await db.from('site_nav_items').update({ parent_id: parentId, sort_order: i + 1 }).eq('brand_key', brandKey).eq('id', sibs[i].id);
  }
  await audit({ actorId: actorClerkId, action: 'nav.save', target: `site:${brandKey}`, meta: { moved: id, parentId, index } });
}

export async function deleteNavItem(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('site_nav_items').delete().eq('brand_key', brandKey).eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'nav.save', target: `site:${brandKey}`, meta: { deleted: id } });
}
