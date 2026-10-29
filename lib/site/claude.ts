import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { AI_MODEL } from '@/lib/ai/claude';
import { BLOCK_BY_TYPE, stripHtml, type Block, type BlockType } from '@/lib/site/blocks';
import { listLocations, listPrograms, locationStatusLabel, programStatusLabel, type SiteLocation, type SiteProgram } from '@/lib/site/records';
import { listPages } from '@/lib/site/pages';
import type { BrandSite } from '@/lib/site/sites';

/**
 * Claude in the site editor (ALL CAN §7). One client, every call grounded in
 * THIS brand's records only (programs, locations, published pages, parent
 * guide), never other brands' data and never personal data. Each call is
 * audit-logged (who, page, records used, tokens). Every result is a draft the
 * editor reviews; nothing is published by Claude. Without ANTHROPIC_API_KEY a
 * deterministic fallback keeps the editor usable.
 */

const VOICE = `Voice: short sentences, present tense, plain language for parents. Every headline ends with a period. Dates stacked as "Saturday / April 4th / 2026."; times like "7:30pm ET"; scores and records with an en dash (84–79, 12–3); inline meta with middle dots (De La Salle College · Court 2 · 7:30pm ET). The brand is always written "ALL CAN" / "ALL CAN Sport". Never invent a date, price, age group, coach, partner or stat: any fact not in the records provided must be written exactly as [TBC].`;

interface ClaudeResult { text: string; source: 'claude' | 'fallback'; inputTokens?: number; outputTokens?: number }

async function call(system: string, user: string, maxTokens = 900): Promise<ClaudeResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.content ?? []).map((c: { text?: string }) => c.text ?? '').join('').trim();
    return text ? { text, source: 'claude', inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens } : null;
  } catch {
    return null;
  }
}

export interface RecordSource { key: string; label: string; text: string }

/** The records an editor can tick as sources. Facts only; no personal data. */
export async function recordSources(brandKey: string): Promise<RecordSource[]> {
  const [locs, progs, pages] = await Promise.all([listLocations(brandKey), listPrograms(brandKey), listPages(brandKey)]);
  const out: RecordSource[] = [];
  for (const p of progs) {
    const loc = locs.find((l) => l.slug === p.locationSlug);
    out.push({ key: `program:${p.slug}`, label: `Program · ${p.name}, ${loc?.name ?? p.locationSlug}`, text: programText(p, loc ?? null) });
  }
  for (const l of locs) out.push({ key: `location:${l.slug}`, label: `Location · ${l.name} (${l.venue ?? ''})`, text: locationText(l) });
  const guide = pages.find((p) => p.template === 'parent-guide');
  if (guide) out.push({ key: 'page:parent-guide', label: 'Parent guide', text: pageText(guide.blocksPublished ?? guide.blocksDraft) });
  for (const p of pages.filter((x) => x.kind === 'custom' && x.blocksPublished)) out.push({ key: `page:${p.slug}`, label: `Page · ${p.title}`, text: pageText(p.blocksPublished!) });
  return out;
}

function programText(p: SiteProgram, loc: SiteLocation | null): string {
  return [`${p.name} (${p.leagueType}, ${p.sport}) at ${loc?.venue ?? loc?.name ?? p.locationSlug}. Status: ${programStatusLabel(p).label}.`, ...p.facts.map(([k, v]) => `${k}: ${v}`), p.description ?? ''].filter(Boolean).join('\n');
}
function locationText(l: SiteLocation): string {
  return [`${l.name} (${l.city ?? ''}, ${l.region}). Venue: ${l.venue ?? '[TBC]'}. Address: ${l.address ?? '[TBC]'}. Status: ${locationStatusLabel(l).label}.`, `Parking: ${l.parking ?? '[TBC]'}. Arrival: ${l.arrival ?? '[TBC]'}. Contact: ${l.contact ?? '[TBC]'}.`, `Sports: ${l.sports.join(', ')}.`, ...l.calendar.map(([k, v]) => `${k}: ${v}`)].join('\n');
}
export function pageText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const p = b.props as Record<string, unknown>;
    if (typeof p.heading === 'string' && p.heading) parts.push(p.heading);
    if (typeof p.html === 'string') parts.push(stripHtml(p.html));
    if (typeof p.mission === 'string') parts.push(p.mission);
    if (Array.isArray(p.items)) for (const it of p.items as Record<string, string>[]) if (it.q) parts.push(`${it.q} ${it.a ?? ''} ${it.note ?? ''}`);
    if (Array.isArray(p.facts)) for (const f of p.facts as string[][]) parts.push(`${f[0]}: ${f[1]}`);
  }
  return parts.join('\n').slice(0, 6000);
}

const countTbc = (t: string) => (t.match(/\[TBC\]/g) ?? []).length;

/** Write with Claude (block): draft copy from ticked records. */
export async function writeBlock(site: BrandSite, input: { prompt: string; sourceKeys: string[]; length: string; pageTitle: string; actorClerkId: string }): Promise<{ text: string; tbc: number; source: 'claude' | 'fallback' }> {
  const sources = (await recordSources(site.brandKey)).filter((s) => input.sourceKeys.includes(s.key));
  const records = sources.map((s) => `## ${s.label}\n${s.text}`).join('\n\n') || '(no records chosen)';
  const len = input.length.startsWith('Bullet') ? 'a short bullet list (use <ul><li>)' : input.length.startsWith('Medium') ? 'about four short paragraphs' : 'two short paragraphs';
  const res = await call(
    `You write website copy for ${site.name}, a division of ${site.contact.legal_name ?? 'Athlete Institute'}. ${VOICE} Use ONLY the records provided. Output HTML using only <p>, <ul>, <li>, <b>, <a> tags. Write ${len}.`,
    `Page: ${input.pageTitle}\n\nWhat the block should say: ${input.prompt}\n\nRecords:\n${records}`,
  );
  const first = sources[0];
  const text = res?.text ?? `<p>${first ? first.text.split('\n')[0] : `${site.name} programs are run by professional coaches.`}</p><p>Ages, days and dates are [TBC]. Registration isn't open yet. Leave your email on the location page and we'll tell you the moment it opens.</p>`;
  await audit({ actorId: input.actorClerkId, action: 'site.claude.write', target: `site:${site.brandKey}`, meta: { page: input.pageTitle, sources: input.sourceKeys, tokens: res ? (res.inputTokens ?? 0) + (res.outputTokens ?? 0) : 0, source: res ? 'claude' : 'fallback' } });
  return { text, tbc: countTbc(text), source: res ? 'claude' : 'fallback' };
}

/** Build a page with Claude: a structured block proposal validated against the schema. */
export async function proposePage(site: BrandSite, description: string, actorClerkId: string): Promise<{ title: string; blocks: Block[]; why: string[] }> {
  const sources = await recordSources(site.brandKey);
  const types = Object.keys(BLOCK_BY_TYPE).filter((t) => t !== 'claude');
  const res = await call(
    `You plan web pages for ${site.name}. ${VOICE} Return ONLY JSON: {"title": string, "blocks": [{"type": one of ${JSON.stringify(types)}, "props": object, "why": string}]}. Use the block defaults as prop shapes: ${JSON.stringify(Object.fromEntries(types.map((t) => [t, BLOCK_BY_TYPE[t].defaults])))}. Prefer fact_block and program_card for facts (bind programSlug to a record), faq for questions, interest_form when registration isn't open. Use ONLY the records for facts.`,
    `Describe the page: ${description}\n\nRecords:\n${sources.map((s) => `## ${s.label} [${s.key}]\n${s.text}`).join('\n\n')}`,
    2000,
  );
  let title = description.slice(0, 60);
  let proposed: { type: string; props: Record<string, unknown>; why?: string }[] = [];
  if (res) {
    try {
      const json = JSON.parse(res.text.replace(/^```json?\s*|```$/g, ''));
      title = typeof json.title === 'string' ? json.title : title;
      proposed = Array.isArray(json.blocks) ? json.blocks : [];
    } catch { proposed = []; }
  }
  if (!proposed.length) {
    const prog = sources.find((s) => s.key.startsWith('program:'));
    const slug = prog?.key.split(':')[1] ?? '';
    proposed = [
      { type: 'hero', props: { style: 'ink', heading: `${title.replace(/\.?$/, '')}.`, ctaLabel: 'Find your location', ctaHref: '/locations' }, why: 'Every page opens with a hero.' },
      { type: 'rich_text', props: { heading: 'How it works.', html: '<p>Each session opens with a skills block, then moves into gameplay so players use what they learned.</p><p>Ages, days and season dates are [TBC].</p>' }, why: 'Explains the format in the brand voice.' },
      ...(slug ? [{ type: 'program_card', props: { programSlug: slug }, why: 'Live facts from the program record.' }] : []),
      { type: 'faq', props: { label: 'Before you register', items: [{ q: 'What should we bring?', a: 'Indoor shoes, a water bottle and the ALL CAN jersey once issued.', note: 'Jersey details are [TBC].' }] }, why: 'The questions families ask first.' },
      { type: 'interest_form', props: { programSlug: slug, context: 'registration' }, why: 'Registration isn\'t open yet, so capture interest.' },
    ];
  }
  const { validateBlocks } = await import('@/lib/site/blocks');
  const { blocks } = validateBlocks(proposed.map((b, i) => ({ id: `b-${Date.now().toString(36)}-${i}`, type: b.type as BlockType, props: b.props })));
  const why = proposed.map((b) => b.why ?? '').slice(0, blocks.length);
  await audit({ actorId: actorClerkId, action: 'site.claude.propose', target: `site:${site.brandKey}`, meta: { description: description.slice(0, 200), blocks: blocks.map((b) => b.type), source: res ? 'claude' : 'fallback' } });
  return { title, blocks, why };
}

/** SEO: a search title and description for a page from its records and keywords. */
export async function writeSeo(site: BrandSite, input: { pageTitle: string; pageText: string; keywords: string[]; actorClerkId: string }): Promise<{ title: string; description: string; keyword: string | null }> {
  const res = await call(
    `You write search titles and meta descriptions for ${site.name}. Return ONLY JSON {"title": string (max 60 characters, ends with " · ${site.name}"), "description": string (120 to 160 characters, plain, no quotes), "keyword": the one keyword phrase you used or null}. Use a keyword naturally when it fits. Never invent facts.`,
    `Page: ${input.pageTitle}\nKeywords: ${input.keywords.join(', ') || '(none)'}\nPage text:\n${input.pageText.slice(0, 3000)}`,
    400,
  );
  let out = { title: `${input.pageTitle} · ${site.name}`.slice(0, 60), description: `${input.pageTitle} at ${site.name}: ${site.seo.default_description ?? ''}`.slice(0, 160), keyword: null as string | null };
  if (res) { try { const j = JSON.parse(res.text.replace(/^```json?\s*|```$/g, '')); out = { title: String(j.title ?? out.title).slice(0, 70), description: String(j.description ?? out.description).slice(0, 170), keyword: j.keyword ? String(j.keyword) : null }; } catch { /* keep fallback */ } }
  await audit({ actorId: input.actorClerkId, action: 'site.claude.seo', target: `site:${site.brandKey}`, meta: { page: input.pageTitle, source: res ? 'claude' : 'fallback' } });
  return out;
}

/** Stories: a draft article from records. Returns blocks + a summary. */
export async function draftStory(site: BrandSite, input: { topic: string; locationSlug?: string; programSlug?: string; actorClerkId: string }): Promise<{ title: string; excerpt: string; blocks: Block[]; tbc: number; source: 'claude' | 'fallback' }> {
  const sources = (await recordSources(site.brandKey)).filter((s) => (input.programSlug && s.key === `program:${input.programSlug}`) || (input.locationSlug && s.key === `location:${input.locationSlug}`) || s.key === 'page:parent-guide');
  const res = await call(
    `You write short news articles for ${site.name}'s website. ${VOICE} Return ONLY JSON {"title": string, "excerpt": string (max 160 chars), "body": [{"t": "p"|"h"|"q", "v": string}]} with 4 to 7 body items. Use ONLY the records for facts.`,
    `Topic: ${input.topic}\n\nRecords:\n${sources.map((s) => `## ${s.label}\n${s.text}`).join('\n\n')}`,
    1200,
  );
  let title = input.topic.slice(0, 80), excerpt = '', items: { t: string; v: string }[] = [];
  if (res) { try { const j = JSON.parse(res.text.replace(/^```json?\s*|```$/g, '')); title = String(j.title ?? title); excerpt = String(j.excerpt ?? ''); items = Array.isArray(j.body) ? j.body : []; } catch { items = []; } }
  if (!items.length) {
    const prog = sources.find((s) => s.key.startsWith('program:'));
    excerpt = excerpt || `${prog ? prog.label.replace('Program · ', '') : site.name}: how sessions work and how to hear first when registration opens.`;
    items = [
      { t: 'p', v: `${prog ? prog.text.split('\n')[0] : `${site.name} is coming to a location near you.`} Registration opens on [TBC].` },
      { t: 'h', v: 'What a session looks like' },
      { t: 'p', v: 'Every session opens with a 30-minute skills block. Coaches teach one movement or decision, then players use it in gameplay.' },
      { t: 'h', v: 'What to know before you register' },
      { t: 'p', v: 'Ages, days, times and price are [TBC]. Every coach is screened before working with players. Financial assistance is available, and requests are confidential.' },
      { t: 'q', v: 'Leave your email on the location page and we\'ll tell you the moment registration opens.' },
    ];
  }
  const html = items.map((it) => it.t === 'h' ? `<h3>${esc(it.v)}</h3>` : it.t === 'q' ? `<blockquote>${esc(it.v)}</blockquote>` : `<p>${esc(it.v)}</p>`).join('');
  const { validateBlocks } = await import('@/lib/site/blocks');
  const { blocks } = validateBlocks([{ id: 'p1', type: 'rich_text', props: { html } }]);
  const text = JSON.stringify(blocks);
  await audit({ actorId: input.actorClerkId, action: 'site.claude.story', target: `site:${site.brandKey}`, meta: { topic: input.topic.slice(0, 200), source: res ? 'claude' : 'fallback' } });
  return { title, excerpt, blocks, tbc: countTbc(text), source: res ? 'claude' : 'fallback' };
}

/** Alt text for a photo. The image is sent to the model; staff review before use. */
export async function describeImage(site: BrandSite, imageUrl: string, name: string, actorClerkId: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  let text: string | null = null;
  if (key) {
    try {
      const abs = imageUrl.startsWith('http') ? imageUrl : null;
      if (abs) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: AI_MODEL, max_tokens: 120, system: `Write alt text for a sports website photo: one sentence, plain, what's in the photo and what's happening, no names of people. It's for ${site.name}.`, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: abs } }, { type: 'text', text: `Alt text for ${name}:` }] }] }),
          cache: 'no-store',
        });
        if (res.ok) { const j = await res.json(); text = (j.content ?? []).map((c: { text?: string }) => c.text ?? '').join('').trim() || null; }
      }
    } catch { text = null; }
  }
  await audit({ actorId: actorClerkId, action: 'site.claude.alt', target: `site:${site.brandKey}`, meta: { name, source: text ? 'claude' : 'fallback' } });
  return text ?? `${site.name} photo: ${name.replace(/[-_]/g, ' ').replace(/\.[a-z0-9]+$/i, '')} [describe what's in it]`;
}

/** Keyword suggestions polished by Claude when available. */
export async function suggestKeywords(site: BrandSite, seeds: string[]): Promise<string[]> {
  const res = await call(`Return ONLY a JSON array of 6 short search phrases (2 to 4 words each) a parent would type into Google to find ${site.name}'s programs. Base them on these seeds and keep place names: ${seeds.join('; ')}.`, 'Phrases:', 200);
  if (res) { try { const j = JSON.parse(res.text.replace(/^```json?\s*|```$/g, '')); if (Array.isArray(j)) return j.map(String).filter((s) => s.split(/\s+/).length >= 2 && s.split(/\s+/).length <= 4).slice(0, 6); } catch { /* fall through */ } }
  return seeds;
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** Questions the site couldn't answer (Ask), for the dashboard. */
export async function unansweredQuestions(brandKey: string, limit = 8): Promise<{ question: string; at: string }[]> {
  const { data } = await supabaseAdmin().from('site_ask_logs').select('question, created_at').eq('brand_key', brandKey).eq('handed_off', true).order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map((r) => ({ question: r.question, at: r.created_at }));
}
