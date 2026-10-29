import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { slugify, validateBlocks, type Block } from '@/lib/site/blocks';

/** Stories (news/blog) per site, with scheduling (Module 23 §2.4, ALL CAN §6.7). */

export type PostStatus = 'draft' | 'scheduled' | 'published';

export interface SitePost {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  type: string;
  locationSlug: string | null;
  sport: string | null;
  programSlug: string | null;
  authorLabel: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  coverCredit: string | null;
  body: Block[];
  status: PostStatus;
  publishedAt: string | null;
  seo: { title?: string; description?: string };
  updatedAt: string;
}

const COLS = 'id, slug, title, excerpt, type, location_slug, sport, program_slug, author_label, cover_url, cover_alt, cover_credit, body_blocks, status, published_at, seo, updated_at';

function toPost(r: Record<string, unknown>): SitePost {
  return {
    id: r.id as number, slug: r.slug as string, title: r.title as string, excerpt: (r.excerpt as string) ?? null, type: (r.type as string) ?? 'Announcement',
    locationSlug: (r.location_slug as string) ?? null, sport: (r.sport as string) ?? null, programSlug: (r.program_slug as string) ?? null,
    authorLabel: (r.author_label as string) ?? null, coverUrl: (r.cover_url as string) ?? null, coverAlt: (r.cover_alt as string) ?? null, coverCredit: (r.cover_credit as string) ?? null,
    body: (r.body_blocks as Block[]) ?? [], status: (r.status as PostStatus) ?? 'draft', publishedAt: (r.published_at as string) ?? null,
    seo: (r.seo as SitePost['seo']) ?? {}, updatedAt: r.updated_at as string,
  };
}

/** Public: published, newest first. */
export async function publishedPosts(brandKey: string, filter: { type?: string; limit?: number } = {}): Promise<SitePost[]> {
  let q = supabaseAdmin().from('site_posts').select(COLS).eq('brand_key', brandKey).eq('status', 'published').lte('published_at', new Date().toISOString()).order('published_at', { ascending: false });
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.limit) q = q.limit(filter.limit);
  const { data } = await q;
  return (data ?? []).map(toPost);
}

export async function publicPost(brandKey: string, slug: string): Promise<SitePost | null> {
  const { data } = await supabaseAdmin().from('site_posts').select(COLS).eq('brand_key', brandKey).eq('slug', slug).eq('status', 'published').maybeSingle();
  return data ? toPost(data) : null;
}

export async function listPostsAdmin(brandKey: string): Promise<SitePost[]> {
  const { data } = await supabaseAdmin().from('site_posts').select(COLS).eq('brand_key', brandKey).order('updated_at', { ascending: false });
  return (data ?? []).map(toPost);
}

export async function getPostAdmin(brandKey: string, id: number): Promise<SitePost | null> {
  const { data } = await supabaseAdmin().from('site_posts').select(COLS).eq('brand_key', brandKey).eq('id', id).maybeSingle();
  return data ? toPost(data) : null;
}

export interface PostInput {
  id?: number;
  title: string; slug?: string; excerpt?: string; type?: string; locationSlug?: string | null; sport?: string | null; programSlug?: string | null;
  authorLabel?: string; coverUrl?: string | null; coverAlt?: string | null; coverCredit?: string | null; body: unknown; seoTitle?: string;
}

/** Save as draft (or keep a live story live with new content). */
export async function savePost(brandKey: string, input: PostInput, mode: 'draft' | 'publish' | 'schedule', scheduleAt: string | null, actorClerkId: string): Promise<SitePost> {
  const db = supabaseAdmin();
  const { blocks, issues } = validateBlocks(input.body);
  if (issues.length) throw new Error(issues[0].message);
  const title = input.title.trim();
  if (!title) throw new Error('Add a title first.');
  if (mode !== 'draft') {
    if (input.coverUrl && !input.coverAlt?.trim()) throw new Error('Describe the cover photo (alt text) before publishing.');
    if (!blocks.some((b) => JSON.stringify(b.props).replace(/<[^>]+>/g, '').trim().length > 20)) throw new Error('The body is empty.');
  }
  const existing = input.id ? await getPostAdmin(brandKey, input.id) : null;
  let slug = slugify(input.slug || title) || `story-${Date.now()}`;
  if (!existing || existing.slug !== slug) {
    const { data: taken } = await db.from('site_posts').select('id').eq('brand_key', brandKey).eq('slug', slug).maybeSingle();
    if (taken && taken.id !== input.id) slug = `${slug}-2`;
  }
  let status: PostStatus = existing?.status ?? 'draft';
  let publishedAt = existing?.publishedAt ?? null;
  if (mode === 'publish') { status = 'published'; publishedAt = existing?.status === 'published' && publishedAt ? publishedAt : new Date().toISOString(); }
  if (mode === 'schedule') { status = 'scheduled'; publishedAt = scheduleAt && !Number.isNaN(Date.parse(scheduleAt)) ? new Date(scheduleAt).toISOString() : null; if (!publishedAt) throw new Error('Pick a date and time to schedule.'); }
  if (mode === 'draft' && existing?.status !== 'published') { status = 'draft'; }
  const row = {
    brand_key: brandKey, slug, title: title.replace(/\.?$/, '.'), excerpt: input.excerpt?.trim() || null, type: input.type || 'Announcement', location_slug: input.locationSlug || null, sport: input.sport || null,
    program_slug: input.programSlug || null, author_label: input.authorLabel?.trim() || null, cover_url: input.coverUrl || null, cover_alt: input.coverAlt || null, cover_credit: input.coverCredit || null,
    body_blocks: blocks, status, published_at: publishedAt, seo: input.seoTitle ? { title: input.seoTitle } : {}, created_by: actorClerkId,
  };
  let data;
  if (existing) {
    const res = await db.from('site_posts').update(row).eq('brand_key', brandKey).eq('id', existing.id).select(COLS).single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } else {
    const res = await db.from('site_posts').insert(row).select(COLS).single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  }
  if (mode !== 'draft') await audit({ actorId: actorClerkId, action: 'post.publish', target: `post:${data.id}`, meta: { brandKey, status, publishedAt } });
  return toPost(data);
}

export async function unpublishPost(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  await supabaseAdmin().from('site_posts').update({ status: 'draft' }).eq('brand_key', brandKey).eq('id', id);
  await audit({ actorId: actorClerkId, action: 'post.unpublish', target: `post:${id}`, meta: { brandKey } });
}

export async function deletePost(brandKey: string, id: number, actorClerkId: string): Promise<void> {
  const p = await getPostAdmin(brandKey, id);
  if (!p) return;
  if (p.status === 'published') throw new Error('Unpublish the story before deleting it.');
  await supabaseAdmin().from('site_posts').delete().eq('brand_key', brandKey).eq('id', id);
  await audit({ actorId: actorClerkId, action: 'post.delete', target: `post:${id}`, meta: { brandKey } });
}

/** Cron: flip scheduled stories whose time has come. */
export async function publishDuePosts(): Promise<number> {
  const db = supabaseAdmin();
  const { data } = await db.from('site_posts').select('id').eq('status', 'scheduled').lte('published_at', new Date().toISOString());
  if (!data?.length) return 0;
  await db.from('site_posts').update({ status: 'published' }).in('id', data.map((d) => d.id));
  return data.length;
}
