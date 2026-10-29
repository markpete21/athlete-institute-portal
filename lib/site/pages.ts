import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { RESERVED_SLUGS, slugify, validateBlocks, type Block } from '@/lib/site/blocks';

/**
 * Site pages (Module 23 §2.2). State is DERIVED, never stored twice:
 *   draft      = blocks_published is null
 *   published  = blocks_published is not null and equals blocks_draft
 *   changes    = both set and different ("published, unsaved changes")
 */

export type PageState = 'draft' | 'published' | 'changes';
export type PageKind = 'custom' | 'home' | 'system';

export interface PageSeo { title?: string; description?: string; og_image_url?: string; noindex?: boolean }

export interface SitePage {
  id: number;
  brandKey: string;
  kind: PageKind;
  template: string;
  ref: string | null;
  slug: string;
  title: string;
  blocksDraft: Block[];
  blocksPublished: Block[] | null;
  publishedAt: string | null;
  hiddenFromMenu: boolean;
  seo: PageSeo;
  sortOrder: number;
  lastEditedBy: string | null;
  updatedAt: string;
  state: PageState;
}

const COLS = 'id, brand_key, kind, template, ref, slug, title, blocks_draft, blocks_published, published_at, hidden_from_menu, seo, sort_order, last_edited_by, updated_at';

export function deriveState(draft: unknown, published: unknown): PageState {
  if (published == null) return 'draft';
  return JSON.stringify(draft) === JSON.stringify(published) ? 'published' : 'changes';
}

function toPage(r: Record<string, unknown>): SitePage {
  return {
    id: r.id as number,
    brandKey: r.brand_key as string,
    kind: r.kind as PageKind,
    template: (r.template as string) ?? 'custom',
    ref: (r.ref as string) ?? null,
    slug: r.slug as string,
    title: r.title as string,
    blocksDraft: (r.blocks_draft as Block[]) ?? [],
    blocksPublished: (r.blocks_published as Block[] | null) ?? null,
    publishedAt: (r.published_at as string) ?? null,
    hiddenFromMenu: !!r.hidden_from_menu,
    seo: (r.seo as PageSeo) ?? {},
    sortOrder: (r.sort_order as number) ?? 100,
    lastEditedBy: (r.last_edited_by as string) ?? null,
    updatedAt: r.updated_at as string,
    state: deriveState(r.blocks_draft, r.blocks_published),
  };
}

export async function listPages(brandKey: string): Promise<SitePage[]> {
  const { data } = await supabaseAdmin().from('site_pages').select(COLS).eq('brand_key', brandKey).order('sort_order').order('id');
  return (data ?? []).map(toPage);
}

export async function getPage(brandKey: string, id: number): Promise<SitePage | null> {
  const { data } = await supabaseAdmin().from('site_pages').select(COLS).eq('brand_key', brandKey).eq('id', id).maybeSingle();
  return data ? toPage(data) : null;
}

export async function getPageBySlug(brandKey: string, slug: string): Promise<SitePage | null> {
  const { data } = await supabaseAdmin().from('site_pages').select(COLS).eq('brand_key', brandKey).eq('slug', slug).maybeSingle();
  return data ? toPage(data) : null;
}

/** The page a public URL path should render, by slug (custom or system). */
export async function resolvePublicPage(brandKey: string, slug: string): Promise<SitePage | null> {
  const page = await getPageBySlug(brandKey, slug);
  if (!page) return null;
  return page;
}

export async function createPage(input: { brandKey: string; title: string; slug?: string; template?: string; blocks?: Block[]; actorClerkId: string; hiddenFromMenu?: boolean }): Promise<SitePage> {
  const db = supabaseAdmin();
  let slug = slugify(input.slug || input.title);
  if (!slug) throw new Error('Add a page title.');
  if (RESERVED_SLUGS.has(slug.split('/')[0])) throw new Error(`"/${slug}" is reserved by the site. Choose another address.`);
  const { data: taken } = await db.from('site_pages').select('slug').eq('brand_key', input.brandKey).like('slug', `${slug}%`);
  const set = new Set((taken ?? []).map((t) => t.slug));
  const base = slug;
  let n = 2;
  while (set.has(slug)) slug = `${base}-${n++}`;
  const { blocks, issues } = validateBlocks(input.blocks ?? []);
  if (issues.length) throw new Error(issues[0].message);
  const { data, error } = await db.from('site_pages').insert({
    brand_key: input.brandKey, kind: 'custom', template: input.template ?? 'custom', slug, title: input.title.trim(), blocks_draft: blocks, hidden_from_menu: !!input.hiddenFromMenu, last_edited_by: input.actorClerkId, sort_order: 500,
  }).select(COLS).single();
  if (error) throw new Error(`page create failed: ${error.message}`);
  await audit({ actorId: input.actorClerkId, action: 'page.create', target: `page:${data.id}`, meta: { brandKey: input.brandKey, slug } });
  return toPage(data);
}

/** Save the DRAFT only. Publish copies draft -> published. */
export async function saveDraft(brandKey: string, id: number, blocks: unknown, actorClerkId: string): Promise<{ page: SitePage; issues: { blockId: string; message: string }[] }> {
  const { blocks: clean, issues } = validateBlocks(blocks);
  const { data, error } = await supabaseAdmin().from('site_pages').update({ blocks_draft: clean, last_edited_by: actorClerkId }).eq('brand_key', brandKey).eq('id', id).select(COLS).single();
  if (error) throw new Error(error.message);
  return { page: toPage(data), issues };
}

export async function updatePageMeta(brandKey: string, id: number, patch: { title?: string; slug?: string; hiddenFromMenu?: boolean; seo?: PageSeo }, actorClerkId: string): Promise<{ page: SitePage; redirectFrom?: string }> {
  const db = supabaseAdmin();
  const current = await getPage(brandKey, id);
  if (!current) throw new Error('Page not found.');
  const row: Record<string, unknown> = { last_edited_by: actorClerkId };
  let redirectFrom: string | undefined;
  if (patch.title !== undefined) row.title = patch.title.trim() || current.title;
  if (patch.hiddenFromMenu !== undefined) row.hidden_from_menu = patch.hiddenFromMenu;
  if (patch.seo !== undefined) row.seo = { ...current.seo, ...patch.seo };
  if (patch.slug !== undefined && current.kind === 'custom') {
    const slug = slugify(patch.slug);
    if (slug && slug !== current.slug) {
      if (RESERVED_SLUGS.has(slug.split('/')[0])) throw new Error(`"/${slug}" is reserved by the site.`);
      const { data: clash } = await db.from('site_pages').select('id').eq('brand_key', brandKey).eq('slug', slug).maybeSingle();
      if (clash) throw new Error(`Another page already uses /${slug}.`);
      row.slug = slug;
      redirectFrom = `/${current.slug}`;
    }
  }
  const { data, error } = await db.from('site_pages').update(row).eq('brand_key', brandKey).eq('id', id).select(COLS).single();
  if (error) throw new Error(error.message);
  if (redirectFrom) {
    const { addRedirect } = await import('@/lib/site/seo');
    await addRedirect(brandKey, redirectFrom, `/${row.slug as string}`, 'Added when the address changed', actorClerkId);
    await db.from('site_nav_items').update({ href: `/${row.slug as string}` }).eq('brand_key', brandKey).eq('page_id', id);
  }
  return { page: toPage(data), redirectFrom };
}

export async function publishPage(brandKey: string, id: number, actorClerkId: string): Promise<SitePage> {
  const db = supabaseAdmin();
  const current = await getPage(brandKey, id);
  if (!current) throw new Error('Page not found.');
  const { data, error } = await db.from('site_pages').update({ blocks_published: current.blocksDraft, published_at: new Date().toISOString(), published_by: actorClerkId }).eq('brand_key', brandKey).eq('id', id).select(COLS).single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'page.publish', target: `page:${id}`, meta: { brandKey, slug: current.slug } });
  return toPage(data);
}

export async function unpublishPage(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  const current = await getPage(brandKey, id);
  if (!current) throw new Error('Page not found.');
  if (current.kind !== 'custom') throw new Error('System pages can be hidden from the menu, not unpublished.');
  const { error } = await supabaseAdmin().from('site_pages').update({ blocks_published: null, published_at: null }).eq('brand_key', brandKey).eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'page.unpublish', target: `page:${id}`, meta: { brandKey } });
}

export async function deletePage(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  const current = await getPage(brandKey, id);
  if (!current) throw new Error('Page not found.');
  if (current.kind !== 'custom') throw new Error('System pages can\'t be deleted. Hide them from the menu instead.');
  const { error } = await supabaseAdmin().from('site_pages').delete().eq('brand_key', brandKey).eq('id', id);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'page.delete', target: `page:${id}`, meta: { brandKey, slug: current.slug } });
}

/** Counts for the dashboard. */
export async function pageCounts(brandKey: string): Promise<{ published: number; changes: number; draft: number; hidden: number; lastEdit: { title: string; at: string; by: string | null } | null }> {
  const pages = await listPages(brandKey);
  const latest = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    published: pages.filter((p) => p.state === 'published').length,
    changes: pages.filter((p) => p.state === 'changes').length,
    draft: pages.filter((p) => p.state === 'draft').length,
    hidden: pages.filter((p) => p.hiddenFromMenu).length,
    lastEdit: latest ? { title: latest.title, at: latest.updatedAt, by: latest.lastEditedBy } : null,
  };
}
