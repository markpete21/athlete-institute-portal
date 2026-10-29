import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { dailyViews, topPaths } from '@/lib/site/views';
import { leadCounts } from '@/lib/site/leads';
import type { BrandSite } from '@/lib/site/sites';

/**
 * Analytics for the editor (ALL CAN §6.6). Sources:
 *   - Vercel Web Analytics (visitors, page views, referrers, countries,
 *     devices) through the REST API with a Vercel token; "unavailable" when
 *     the env isn't set rather than an error.
 *   - site_page_views counters (always available): daily views and top paths.
 *   - Google Search Console through a service account (clicks, impressions,
 *     queries); "connect" until credentials exist.
 *   - AI platforms: referrers from AI assistants, crawler hits (from a
 *     request-log table when present), and the weekly visibility checks.
 */

export interface Series { day: string; value: number }
export interface Bar { label: string; value: number; note?: string }

export interface Overview {
  source: 'vercel' | 'counters';
  visitors: number | null;
  pageViews: number;
  bounceRate: number | null;
  changePct: number | null;
  daily: Series[];
  sources: Bar[];
  geography: Bar[];
  devices: Bar[];
  topPages: Bar[];
  signups: Bar[];
}

const AI_REFERRERS: [RegExp, string][] = [[/chatgpt|openai/i, 'ChatGPT'], [/perplexity/i, 'Perplexity'], [/gemini|bard\.google/i, 'Gemini'], [/copilot|bing\.com\/chat/i, 'Copilot'], [/claude\.ai|anthropic/i, 'Claude']];

function vercelEnv(): { token: string; projectId: string; teamId?: string } | null {
  const token = process.env.VERCEL_ANALYTICS_TOKEN, projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID };
}

/**
 * Vercel Web Analytics REST read. The exact endpoint shape is confirmed at
 * deploy time against Vercel's docs; this client expects the insights
 * endpoint and degrades to counters on any failure.
 */
async function vercelInsights(site: BrandSite, days: number): Promise<Partial<Overview> | null> {
  const env = vercelEnv();
  if (!env) return null;
  const host = site.primaryHost ?? site.hostnames[0];
  if (!host) return null;
  const to = new Date(), from = new Date(Date.now() - days * 86_400_000);
  const q = (type: string, extra = '') => `https://vercel.com/api/web-analytics/${type}?projectId=${env.projectId}${env.teamId ? `&teamId=${env.teamId}` : ''}&from=${from.toISOString()}&to=${to.toISOString()}&filter=${encodeURIComponent(JSON.stringify({ host: { values: [host] } }))}${extra}`;
  const get = async (url: string) => { const r = await fetch(url, { headers: { authorization: `Bearer ${env.token}` }, next: { revalidate: 900 } }); return r.ok ? r.json() : null; };
  try {
    const [stats, timeseries, referrers, countries, devices, paths] = await Promise.all([get(q('stats')), get(q('timeseries')), get(q('stats', '&groupBy=referrer')), get(q('stats', '&groupBy=country')), get(q('stats', '&groupBy=device')), get(q('stats', '&groupBy=path'))]);
    if (!stats) return null;
    const rows = (x: unknown) => (Array.isArray((x as { data?: unknown[] })?.data) ? (x as { data: Record<string, unknown>[] }).data : []);
    const bars = (x: unknown, key: string): Bar[] => rows(x).map((r) => ({ label: String(r[key] ?? r.key ?? ''), value: Number(r.visitors ?? r.total ?? 0) })).filter((b) => b.label).slice(0, 8);
    const refs = bars(referrers, 'referrer');
    const sources: Bar[] = [];
    const bucket = (label: string, v: number) => { const b = sources.find((s) => s.label === label); if (b) b.value += v; else sources.push({ label, value: v }); };
    for (const r of refs) {
      const ai = AI_REFERRERS.find(([re]) => re.test(r.label));
      bucket(ai ? 'AI assistants' : /google/i.test(r.label) ? 'Google search' : /instagram/i.test(r.label) ? 'Instagram' : /athleteinstitute/i.test(r.label) ? 'Athlete Institute sites' : !r.label || r.label === '(direct)' ? 'Direct' : 'Other', r.value);
    }
    return {
      source: 'vercel',
      visitors: Number(stats.visitors ?? stats.data?.visitors ?? 0) || null,
      pageViews: Number(stats.pageviews ?? stats.data?.pageviews ?? 0),
      bounceRate: stats.bounceRate != null ? Number(stats.bounceRate) : null,
      daily: rows(timeseries).map((r) => ({ day: String(r.key ?? r.date ?? '').slice(0, 10), value: Number(r.visitors ?? 0) })),
      sources, geography: bars(countries, 'country'), devices: bars(devices, 'device'), topPages: bars(paths, 'path'),
    };
  } catch {
    return null;
  }
}

export async function overview(site: BrandSite, days: number): Promise<Overview> {
  const [vercel, daily, top, leads] = await Promise.all([vercelInsights(site, days), dailyViews(site.brandKey, days), topPaths(site.brandKey, days, 10), leadCounts(site.brandKey, days)]);
  const prev = await dailyViews(site.brandKey, days * 2);
  const cur = daily.reduce((a, d) => a + d.views, 0);
  const before = prev.slice(0, days).reduce((a, d) => a + d.views, 0);
  const signups: Bar[] = Object.entries(leads).filter(([k]) => k.includes(':')).map(([k, v]) => ({ label: k.replace('interest:', 'Interest · ').replace('request:', 'Request · '), value: v })).sort((a, b) => b.value - a.value).slice(0, 8);
  return {
    source: vercel ? 'vercel' : 'counters',
    visitors: vercel?.visitors ?? null,
    pageViews: vercel?.pageViews ?? cur,
    bounceRate: vercel?.bounceRate ?? null,
    changePct: before > 0 ? Math.round(((cur - before) / before) * 100) : null,
    daily: vercel?.daily?.length ? vercel.daily : daily.map((d) => ({ day: d.day, value: d.views })),
    sources: vercel?.sources ?? [],
    geography: vercel?.geography ?? [],
    devices: vercel?.devices ?? [],
    topPages: vercel?.topPages?.length ? vercel.topPages : top.map((t) => ({ label: t.path, value: t.views })),
    signups,
  };
}

// --- Google Search Console ---------------------------------------------------

export interface GoogleStats { connected: boolean; clicks: number; impressions: number; ctr: number; position: number; daily: Series[]; queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[]; pages: { page: string; clicks: number; position: number }[] }

async function googleAccessToken(): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as { client_email: string; private_key: string };
    const { createSign } = await import('node:crypto');
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`, cache: 'no-store' });
    if (!res.ok) return null;
    return ((await res.json()) as { access_token: string }).access_token;
  } catch {
    return null;
  }
}

export async function googleStats(site: BrandSite, days: number): Promise<GoogleStats> {
  const empty: GoogleStats = { connected: false, clicks: 0, impressions: 0, ctr: 0, position: 0, daily: [], queries: [], pages: [] };
  const property = site.seo.gsc?.property ?? (site.primaryHost ? `sc-domain:${site.primaryHost}` : null);
  if (!site.seo.gsc?.verified_at || !property) return empty;
  const token = await googleAccessToken();
  if (!token) return { ...empty, connected: true };
  const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - (days + 2) * 86_400_000).toISOString().slice(0, 10);
  const query = async (dims: string[], limit = 25) => {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ startDate: start, endDate: end, dimensions: dims, rowLimit: limit }), next: { revalidate: 900 } });
    return res.ok ? ((await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }).rows ?? [] : [];
  };
  try {
    const [totals, byDay, byQuery, byPage] = await Promise.all([query([]), query(['date'], 100), query(['query'], 25), query(['page'], 10)]);
    const t = totals[0];
    return {
      connected: true, clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0, ctr: t?.ctr ?? 0, position: t?.position ?? 0,
      daily: byDay.map((r) => ({ day: r.keys[0], value: r.clicks })),
      queries: byQuery.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 })),
      pages: byPage.map((r) => ({ page: r.keys[0].replace(/^https?:\/\/[^/]+/, '') || '/', clicks: r.clicks, position: Math.round(r.position * 10) / 10 })),
    };
  } catch {
    return { ...empty, connected: true };
  }
}

// --- AI platforms ------------------------------------------------------------

export interface AiQuestionRow { id: number; question: string; results: Record<string, { result: 'cited' | 'mentioned' | 'none'; at: string } | undefined> }
export const AI_ASSISTANTS = ['ChatGPT', 'Perplexity', 'Gemini', 'Copilot', 'Claude'];

export async function aiVisibility(brandKey: string): Promise<AiQuestionRow[]> {
  const db = supabaseAdmin();
  const { data: qs } = await db.from('site_ai_questions').select('id, question').eq('brand_key', brandKey).eq('active', true).order('id');
  if (!qs?.length) return [];
  const { data: checks } = await db.from('site_ai_checks').select('question_id, assistant, result, ran_at').in('question_id', qs.map((q) => q.id)).order('ran_at', { ascending: false });
  const latest = new Map<string, { result: 'cited' | 'mentioned' | 'none'; at: string }>();
  for (const c of checks ?? []) { const k = `${c.question_id}:${c.assistant}`; if (!latest.has(k)) latest.set(k, { result: c.result, at: c.ran_at }); }
  return qs.map((q) => ({ id: q.id, question: q.question, results: Object.fromEntries(AI_ASSISTANTS.map((a) => [a, latest.get(`${q.id}:${a}`)])) }));
}

export async function addAiQuestion(brandKey: string, question: string, actorClerkId: string): Promise<void> {
  const q = question.trim().slice(0, 300);
  if (!q) return;
  await supabaseAdmin().from('site_ai_questions').insert({ brand_key: brandKey, question: q, created_by: actorClerkId });
}

export async function removeAiQuestion(brandKey: string, id: number): Promise<void> {
  await supabaseAdmin().from('site_ai_questions').update({ active: false }).eq('brand_key', brandKey).eq('id', id);
}

/**
 * Weekly visibility run (cron). Asks each configured assistant the tracked
 * questions through its API and records cited / mentioned / none. Only
 * assistants with keys run; the rest stay "not yet". Anthropic's API is used
 * for Claude; others need their own keys (OPENAI_API_KEY, PERPLEXITY_API_KEY,
 * GEMINI_API_KEY).
 */
export async function runAiChecks(brandKey: string, origin: string, siteName: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: qs } = await db.from('site_ai_questions').select('id, question').eq('brand_key', brandKey).eq('active', true);
  if (!qs?.length) return 0;
  const host = origin.replace(/^https?:\/\//, '');
  const grade = (text: string): 'cited' | 'mentioned' | 'none' => (text.toLowerCase().includes(host.toLowerCase()) ? 'cited' : new RegExp(siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text) || /all can/i.test(text) ? 'mentioned' : 'none');
  const runners: [string, ((q: string) => Promise<string | null>) | null][] = [
    ['Claude', process.env.ANTHROPIC_API_KEY ? async (q) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 500, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], messages: [{ role: 'user', content: q }] }), cache: 'no-store' });
      if (!r.ok) return null; const j = await r.json(); return JSON.stringify(j.content ?? '');
    } : null],
    ['ChatGPT', process.env.OPENAI_API_KEY ? async (q) => {
      const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: 'gpt-5', tools: [{ type: 'web_search' }], input: q }), cache: 'no-store' });
      if (!r.ok) return null; return JSON.stringify(await r.json());
    } : null],
    ['Perplexity', process.env.PERPLEXITY_API_KEY ? async (q) => {
      const r = await fetch('https://api.perplexity.ai/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` }, body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: q }] }), cache: 'no-store' });
      if (!r.ok) return null; return JSON.stringify(await r.json());
    } : null],
    ['Gemini', process.env.GEMINI_API_KEY ? async (q) => {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: q }] }], tools: [{ google_search: {} }] }), cache: 'no-store' });
      if (!r.ok) return null; return JSON.stringify(await r.json());
    } : null],
  ];
  let n = 0;
  for (const q of qs) {
    for (const [assistant, run] of runners) {
      if (!run) continue;
      const text = await run(q.question).catch(() => null);
      if (text == null) continue;
      const result = grade(text);
      const cited = result === 'cited' ? (text.match(new RegExp(`https?://${host.replace(/\./g, '\\.')}[^"\\s]*`, 'i'))?.[0] ?? origin) : null;
      await db.from('site_ai_checks').insert({ question_id: q.id, assistant, result, cited_url: cited });
      n += 1;
    }
  }
  return n;
}

export async function aiReferralShare(site: BrandSite, days: number): Promise<{ visits: number | null; byAssistant: Bar[] }> {
  const ov = await vercelInsights(site, days);
  if (!ov?.sources) return { visits: null, byAssistant: [] };
  const ai = ov.sources.find((s) => s.label === 'AI assistants');
  return { visits: ai?.value ?? 0, byAssistant: [] };
}
