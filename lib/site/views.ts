import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Privacy-safe page counters (Module 23 §2.7): (brand, path, day) -> views.
 * No IP, no user agent, no identifiers. Sampled and best-effort: a failed
 * bump never affects the page.
 */

const SAMPLE = 1; // count every render for now; raise to sample when traffic grows

export async function bumpView(brandKey: string, path: string): Promise<void> {
  if (Math.random() * SAMPLE >= 1) return;
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  try {
    await supabaseAdmin().rpc('site_page_view_bump', { p_brand: brandKey, p_path: path.slice(0, 200), p_day: day, p_n: SAMPLE });
  } catch {
    /* best effort */
  }
}

export interface ViewRow { path: string; views: number }

export async function topPaths(brandKey: string, days: number, limit = 10, prefix?: string): Promise<ViewRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  let q = supabaseAdmin().from('site_page_views').select('path, views').eq('brand_key', brandKey).gte('day', since);
  if (prefix) q = q.like('path', `${prefix}%`);
  const { data } = await q;
  const agg = new Map<string, number>();
  for (const r of data ?? []) agg.set(r.path, (agg.get(r.path) ?? 0) + r.views);
  return [...agg.entries()].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, limit);
}

export async function dailyViews(brandKey: string, days: number): Promise<{ day: string; views: number }[]> {
  const since = new Date(Date.now() - days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const { data } = await supabaseAdmin().from('site_page_views').select('day, views').eq('brand_key', brandKey).gte('day', since);
  const agg = new Map<string, number>();
  for (const r of data ?? []) agg.set(r.day, (agg.get(r.day) ?? 0) + r.views);
  const out: { day: string; views: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    out.push({ day: d, views: agg.get(d) ?? 0 });
  }
  return out;
}
