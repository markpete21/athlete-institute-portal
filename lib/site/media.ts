import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { BUCKETS, deleteFile, getPublicUrl, uploadFile } from '@ai/foundation/storage';

/**
 * Media library per site (Module 23 §2.5, ALL CAN §6.8). Files live in the
 * PUBLIC brand-assets bucket under sites/<brand>/… so they render for anonymous
 * visitors. No SVG (public bucket: stored-XSS vector). Usage is computed from
 * page blocks, posts, menu items and site settings so delete is refused while
 * a file is used and Replace keeps every reference.
 */

export type MediaKind = 'photo' | 'logo' | 'video' | 'doc';

export interface SiteMedia {
  id: number;
  kind: MediaKind;
  name: string;
  folder: string;
  path: string | null;
  url: string;
  alt: string | null;
  decorative: boolean;
  credit: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  createdAt: string;
  replacedAt: string | null;
}

const COLS = 'id, kind, name, folder, path, url, alt, decorative, credit, width, height, bytes, created_at, replaced_at';
const ALLOWED: Record<string, MediaKind> = { 'image/png': 'photo', 'image/webp': 'photo', 'image/jpeg': 'photo', 'application/pdf': 'doc', 'video/mp4': 'video', 'video/webm': 'video' };
const MAX = { photo: 15 * 1024 * 1024, logo: 15 * 1024 * 1024, doc: 20 * 1024 * 1024, video: 200 * 1024 * 1024 };

function toMedia(r: Record<string, unknown>): SiteMedia {
  return {
    id: r.id as number, kind: r.kind as MediaKind, name: r.name as string, folder: (r.folder as string) ?? 'Uploads', path: (r.path as string) ?? null, url: r.url as string,
    alt: (r.alt as string) ?? null, decorative: !!r.decorative, credit: (r.credit as string) ?? null, width: (r.width as number) ?? null, height: (r.height as number) ?? null,
    bytes: (r.bytes as number) ?? null, createdAt: r.created_at as string, replacedAt: (r.replaced_at as string) ?? null,
  };
}

export async function listMedia(brandKey: string): Promise<SiteMedia[]> {
  const { data } = await supabaseAdmin().from('site_media').select(COLS).eq('brand_key', brandKey).order('created_at', { ascending: false });
  return (data ?? []).map(toMedia);
}

export async function getMedia(brandKey: string, id: number): Promise<SiteMedia | null> {
  const { data } = await supabaseAdmin().from('site_media').select(COLS).eq('brand_key', brandKey).eq('id', id).maybeSingle();
  return data ? toMedia(data) : null;
}

export const needsAlt = (m: SiteMedia) => m.kind === 'photo' && !m.decorative && !(m.alt ?? '').trim();

/** Where a file is used: page blocks, stories, menu images, site settings. */
export async function mediaUsage(brandKey: string): Promise<Map<string, string[]>> {
  const db = supabaseAdmin();
  const [{ data: pages }, { data: posts }, { data: nav }, { data: site }, { data: locs }] = await Promise.all([
    db.from('site_pages').select('title, blocks_draft, blocks_published').eq('brand_key', brandKey),
    db.from('site_posts').select('title, cover_url, body_blocks').eq('brand_key', brandKey),
    db.from('site_nav_items').select('label, image_url').eq('brand_key', brandKey),
    db.from('brand_sites').select('seo, footer').eq('brand_key', brandKey).maybeSingle(),
    db.from('site_locations').select('name, photo_url').eq('brand_key', brandKey),
  ]);
  const usage = new Map<string, string[]>();
  const add = (url: string | null | undefined, where: string) => { if (!url) return; const arr = usage.get(url) ?? []; if (!arr.includes(where)) arr.push(where); usage.set(url, arr); };
  const scan = (v: unknown, where: string) => { for (const m of JSON.stringify(v ?? '').matchAll(/"(?:imageUrl|wordmarkUrl|logoUrl|url|coverUrl|og_image_url)":"([^"]+)"/g)) add(m[1], where); };
  for (const p of pages ?? []) { scan(p.blocks_draft, p.title); scan(p.blocks_published, p.title); }
  for (const p of posts ?? []) { add(p.cover_url, `Story · ${p.title}`); scan(p.body_blocks, `Story · ${p.title}`); }
  for (const n of nav ?? []) add(n.image_url, `Menu · ${n.label}`);
  for (const l of locs ?? []) add(l.photo_url, `Location · ${l.name}`);
  if (site) { scan(site.seo, 'Sharing image'); scan(site.footer, 'Footer'); }
  return usage;
}

export async function uploadMedia(brandKey: string, file: File, folder: string, actorClerkId: string, replaceId?: number): Promise<SiteMedia> {
  const db = supabaseAdmin();
  const kind = ALLOWED[file.type];
  if (!kind) throw new Error(`${file.name} wasn't added. Use JPG, PNG, WebP, PDF, MP4 or WebM (no SVG).`);
  if (file.size > MAX[kind]) throw new Error(`${file.name} is over the size limit for ${kind === 'photo' ? 'photos (15 MB)' : kind === 'video' ? 'video (200 MB)' : 'documents (20 MB)'}.`);
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  const path = `sites/${brandKey}/${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(0, 60).replace(/\.[^.]*$/, '')}.${ext}`;
  await uploadFile(BUCKETS.brandAssets, path, file, { contentType: file.type, upsert: true });
  const url = getPublicUrl(BUCKETS.brandAssets, path);
  if (replaceId) {
    const prev = await getMedia(brandKey, replaceId);
    if (!prev) throw new Error('File not found.');
    const { data, error } = await db.from('site_media').update({ name: file.name, path, url, bytes: file.size, replaced_at: new Date().toISOString(), width: null, height: null }).eq('brand_key', brandKey).eq('id', replaceId).select(COLS).single();
    if (error) throw new Error(error.message);
    // Repoint every reference to the old URL (references by URL, one site).
    await repointUrl(brandKey, prev.url, url);
    if (prev.path) await deleteFile(BUCKETS.brandAssets, [prev.path]).catch(() => {});
    await audit({ actorId: actorClerkId, action: 'media.replace', target: `media:${replaceId}`, meta: { brandKey, path } });
    return toMedia(data);
  }
  const { data, error } = await db.from('site_media').insert({ brand_key: brandKey, kind, name: file.name, folder: folder || 'Uploads', path, url, bytes: file.size, uploaded_by: actorClerkId }).select(COLS).single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'media.upload', target: `media:${data.id}`, meta: { brandKey, path } });
  return toMedia(data);
}

async function repointUrl(brandKey: string, from: string, to: string): Promise<void> {
  const db = supabaseAdmin();
  const swap = (v: unknown) => JSON.parse(JSON.stringify(v ?? null).split(JSON.stringify(from).slice(1, -1)).join(JSON.stringify(to).slice(1, -1)));
  const { data: pages } = await db.from('site_pages').select('id, blocks_draft, blocks_published').eq('brand_key', brandKey);
  for (const p of pages ?? []) {
    if (!JSON.stringify(p).includes(from)) continue;
    await db.from('site_pages').update({ blocks_draft: swap(p.blocks_draft), blocks_published: p.blocks_published == null ? null : swap(p.blocks_published) }).eq('id', p.id);
  }
  const { data: posts } = await db.from('site_posts').select('id, cover_url, body_blocks').eq('brand_key', brandKey);
  for (const p of posts ?? []) {
    if (!JSON.stringify(p).includes(from)) continue;
    await db.from('site_posts').update({ cover_url: p.cover_url === from ? to : p.cover_url, body_blocks: swap(p.body_blocks) }).eq('id', p.id);
  }
  await db.from('site_nav_items').update({ image_url: to }).eq('brand_key', brandKey).eq('image_url', from);
  await db.from('site_locations').update({ photo_url: to }).eq('brand_key', brandKey).eq('photo_url', from);
}

export async function updateMedia(brandKey: string, id: number, patch: { alt?: string; decorative?: boolean; credit?: string; folder?: string }, actorClerkId: string): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.alt !== undefined) row.alt = patch.alt.trim() || null;
  if (patch.decorative !== undefined) { row.decorative = patch.decorative; if (patch.decorative) row.alt = null; }
  if (patch.credit !== undefined) row.credit = patch.credit.trim() || null;
  if (patch.folder !== undefined) row.folder = patch.folder.trim() || 'Uploads';
  const { error } = await supabaseAdmin().from('site_media').update(row).eq('brand_key', brandKey).eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'media.update', target: `media:${id}`, meta: { brandKey, keys: Object.keys(row) } });
}

export async function deleteMedia(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  const m = await getMedia(brandKey, id);
  if (!m) return;
  const usage = await mediaUsage(brandKey);
  const used = usage.get(m.url);
  if (used?.length) throw new Error(`It's used on ${used.join(', ')}. Remove it there or use Replace.`);
  if (m.path) await deleteFile(BUCKETS.brandAssets, [m.path]).catch(() => {});
  await supabaseAdmin().from('site_media').delete().eq('brand_key', brandKey).eq('id', id);
  await audit({ actorId: actorClerkId, action: 'media.delete', target: `media:${id}`, meta: { brandKey } });
}
