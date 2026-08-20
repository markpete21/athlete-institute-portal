import 'server-only';
import { audit, resolveBrand } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { BUCKETS, deleteFile, getPublicUrl, uploadFile } from '@ai/foundation/storage';

/**
 * Brand settings (admin). The DB row overrides the code seed in
 * @ai/foundation/brands, so staff can change a name, accent or logo without a
 * deploy. Logos live in the PUBLIC brand-assets bucket because they render in
 * the public header for signed-out visitors.
 */

export interface BrandRow {
  key: string;
  name: string;
  accent: string;
  accentInk: string;
  logoUrl: string | null;
  logoPath: string | null;
  tagline: string | null;
  sortOrder: number;
  showInHeader: boolean;
  provisional: boolean;
}

const COLS = 'key, name, accent, accent_ink, logo_url, logo_path, tagline, sort_order, show_in_header, provisional';

function toRow(r: Record<string, unknown>): BrandRow {
  const seed = resolveBrand(r.key as string);
  return {
    key: r.key as string,
    // fall back to the code seed for anything the row leaves null
    name: (r.name as string) ?? seed.name,
    accent: (r.accent as string) ?? seed.accent,
    accentInk: (r.accent_ink as string) ?? seed.accentInk,
    logoUrl: (r.logo_url as string) ?? null,
    logoPath: (r.logo_path as string) ?? null,
    tagline: (r.tagline as string) ?? null,
    sortOrder: (r.sort_order as number) ?? 100,
    showInHeader: r.show_in_header !== false,
    provisional: !!r.provisional,
  };
}

/** All brands, ordered for the settings screen. */
export async function listBrands(): Promise<BrandRow[]> {
  const { data, error } = await supabaseAdmin().from('brands').select(COLS).order('sort_order').order('key');
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRow);
}

/** Brands that appear as logo tiles in the public header, in order. */
export async function headerBrands(): Promise<BrandRow[]> {
  return (await listBrands()).filter((b) => b.showInHeader);
}

// SVG is deliberately NOT allowed: the bucket is public and SVG can carry
// scripts (stored-XSS vector). Raster formats only.
const ALLOWED = ['image/png', 'image/webp', 'image/jpeg'];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — a logo has no business being bigger

/**
 * Upload (or replace) a brand logo. Returns the public URL that the header
 * renders. Replacing removes the previous object so the bucket doesn't grow
 * a tail of orphans.
 */
export async function uploadBrandLogo(input: {
  key: string;
  file: File;
  actorClerkId: string;
}): Promise<{ logoUrl: string; logoPath: string }> {
  const { key, file } = input;
  if (!ALLOWED.includes(file.type)) {
    throw new Error(`Logo must be PNG, WebP or JPEG (got ${file.type || 'unknown'}).`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`Logo must be under 2 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  const db = supabaseAdmin();
  const { data: existing } = await db.from('brands').select('logo_path').eq('key', key).maybeSingle();

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  // Cache-busting filename: the public URL is long-lived, so a new upload needs
  // a new path or browsers/CDN will keep serving the old mark.
  const path = `${key}/logo-${Date.now()}.${ext}`;
  await uploadFile(BUCKETS.brandAssets, path, file, { contentType: file.type, upsert: true });
  const logoUrl = getPublicUrl(BUCKETS.brandAssets, path);

  const { error } = await db.from('brands').upsert(
    { key, logo_url: logoUrl, logo_path: path, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw new Error(`brand logo save failed: ${error.message}`);

  if (existing?.logo_path && existing.logo_path !== path) {
    await deleteFile(BUCKETS.brandAssets, [existing.logo_path]).catch(() => {});
  }
  await audit({ actorId: input.actorClerkId, action: 'brand.logo-uploaded', target: `brand:${key}`, meta: { path } });
  return { logoUrl, logoPath: path };
}

/** Remove a brand's logo (header falls back to the built-in mark). */
export async function removeBrandLogo(key: string, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.from('brands').select('logo_path').eq('key', key).maybeSingle();
  if (data?.logo_path) await deleteFile(BUCKETS.brandAssets, [data.logo_path]).catch(() => {});
  await db.from('brands').update({ logo_url: null, logo_path: null }).eq('key', key);
  await audit({ actorId: actorClerkId, action: 'brand.logo-removed', target: `brand:${key}` });
}

/** Update the editable brand fields (name, accent, tagline, header placement). */
export async function updateBrand(input: {
  key: string;
  name?: string;
  accent?: string;
  tagline?: string | null;
  sortOrder?: number;
  showInHeader?: boolean;
  actorClerkId: string;
}): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.accent !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(input.accent)) throw new Error('Accent must be a #rrggbb hex value.');
    patch.accent = input.accent.toLowerCase();
  }
  if (input.tagline !== undefined) patch.tagline = input.tagline;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.showInHeader !== undefined) patch.show_in_header = input.showInHeader;

  const { error } = await supabaseAdmin().from('brands').upsert({ key: input.key, ...patch }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  await audit({ actorId: input.actorClerkId, action: 'brand.updated', target: `brand:${input.key}`, meta: patch });
}
