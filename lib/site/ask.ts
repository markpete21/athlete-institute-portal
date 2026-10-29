import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { AI_MODEL } from '@/lib/ai/claude';
import { pageText, recordSources } from '@/lib/site/claude';
import { listPages } from '@/lib/site/pages';
import { publishedPosts } from '@/lib/site/posts';
import { getSite, type BrandSite } from '@/lib/site/sites';

/**
 * Ask <brand> (ALL CAN §7.3): a visitor-facing helper that answers ONLY from
 * this site's published pages, program facts and policies, cites the pages it
 * used, and hands off to the contact route when nothing published answers.
 * Grounded-retrieval in the Module 21 style: retrieve first, then answer from
 * the retrieved text only. Never collects personal data, never registers or
 * cancels anything, never answers about another brand's programs.
 */

export interface AskSource { label: string; href: string }
export interface AskResult { answer: string; sources: AskSource[]; handedOff: boolean }

const PUBLIC_RATE_PER_HOUR = 20;

interface Doc { label: string; href: string; text: string }

async function corpus(site: BrandSite): Promise<Doc[]> {
  const [pages, posts, records] = await Promise.all([listPages(site.brandKey), publishedPosts(site.brandKey, { limit: 20 }), recordSources(site.brandKey)]);
  const docs: Doc[] = [];
  for (const p of pages) {
    if (!p.blocksPublished || p.seo.noindex) continue;
    const text = pageText(p.blocksPublished);
    if (text.trim()) docs.push({ label: p.title, href: `/${p.slug}`, text });
  }
  for (const r of records) {
    const [kind, slug] = r.key.split(':');
    const href = kind === 'program' ? `/${slug.split('-')[0]}` : kind === 'location' ? `/${slug}` : `/${slug}`;
    docs.push({ label: r.label, href: kind === 'page' && slug === 'parent-guide' ? '/parent-guide' : href, text: r.text });
  }
  for (const p of posts) docs.push({ label: p.title, href: `/stories/${p.slug}`, text: `${p.excerpt ?? ''}\n${pageText(p.body)}` });
  return docs;
}

/** Simple lexical retrieval: score docs by overlapping terms. */
function retrieve(docs: Doc[], question: string, k = 4): Doc[] {
  const terms = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
  const scored = docs.map((d) => {
    const hay = `${d.label} ${d.text}`.toLowerCase();
    let s = 0;
    for (const t of terms) if (hay.includes(t)) s += 1 + (d.label.toLowerCase().includes(t) ? 1 : 0);
    return { d, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map((x) => x.d);
}
const STOP = new Set(['the', 'and', 'for', 'are', 'can', 'what', 'when', 'where', 'how', 'does', 'with', 'this', 'that', 'you', 'your', 'our', 'all', 'any', 'there', 'about', 'much', 'have', 'from', 'play', 'kids', 'kid']);

export async function checkAskRate(brandKey: string, rateKey: string): Promise<boolean> {
  const { count } = await supabaseAdmin().from('site_ask_logs').select('id', { count: 'exact', head: true }).eq('rate_key', rateKey).gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
  return (count ?? 0) < PUBLIC_RATE_PER_HOUR;
}

export async function ask(brandKey: string, question: string, rateKey: string): Promise<AskResult> {
  const site = await getSite(brandKey);
  if (!site || site.settings.ask_enabled === false) return { answer: 'Ask isn\'t available right now.', sources: [], handedOff: true };
  const handoff = site.settings.ask_handoff_email ?? site.contact.email ?? 'info@athleteinstitute.ca';
  const handoffLine = `A staff member can help: email ${handoff}${site.contact.phone ? ` or call ${site.contact.phone}` : ''}.`;
  const q = question.trim().slice(0, 500);
  if (!q) return { answer: 'Ask me about programs, locations, schedules or policies.', sources: [], handedOff: false };
  if (!(await checkAskRate(brandKey, rateKey))) {
    return { answer: `That's a lot of questions for one hour. ${handoffLine}`, sources: [], handedOff: true };
  }
  const docs = retrieve(await corpus(site), q);
  let answer: string | null = null;
  let handedOff = false;
  const key = process.env.ANTHROPIC_API_KEY;
  if (docs.length && key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: 400,
          system: `You are Ask ${site.name.replace(' Sport', '')}, the helper on ${site.name}'s website. Answer ONLY from the published pages below, in two or three short plain sentences for a parent. If the pages don't answer the question, or a fact shows as [TBC], say that it isn't published yet and that a staff member can help; never guess a date, price, age or rule. Never ask for or repeat personal information. You cannot register, cancel or change anything. Do not discuss other organisations' programs.\n\nPAGES:\n${docs.map((d) => `## ${d.label} (${d.href})\n${d.text.slice(0, 2500)}`).join('\n\n')}`,
          messages: [{ role: 'user', content: q }],
        }),
        cache: 'no-store',
      });
      if (res.ok) { const j = await res.json(); answer = (j.content ?? []).map((c: { text?: string }) => c.text ?? '').join('').trim() || null; }
    } catch { answer = null; }
  }
  if (!answer) {
    if (docs.length) {
      const first = docs[0];
      const line = first.text.split('\n').find((l) => l.trim().length > 30) ?? first.text.slice(0, 200);
      answer = `${line.trim()}${line.includes('[TBC]') ? ' Some of this isn\'t confirmed yet.' : ''} See ${first.label} for more. ${handoffLine}`;
      handedOff = true;
    } else {
      answer = `I can only answer from what's published on this site, and I couldn't find that. ${handoffLine}`;
      handedOff = true;
    }
  }
  if (/isn't published|not published|\[TBC\]|staff member|can't find|couldn't find/i.test(answer)) handedOff = true;
  const sources = docs.map((d) => ({ label: d.label, href: d.href }));
  await supabaseAdmin().from('site_ask_logs').insert({ brand_key: brandKey, rate_key: rateKey, question: q, answered: !!answer, handed_off: handedOff, sources }).then(() => undefined, () => undefined);
  return { answer, sources, handedOff };
}
