/**
 * Communications pure engine (Module 13). Segment combine-logic, A/B split +
 * winner, merge-tag rendering, pre-send spam check, and the engagement filter -
 * all pure/deterministic so they unit-test without I/O. DB-backed sending,
 * scheduling and Resend-webhook ingestion live in lib/comms.
 */

// --- merge tags -------------------------------------------------------------

/** Replace {{key}} tokens with data values (missing keys -> empty string). */
export function renderMergeTags(template: string, data: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = data[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Merge tags referenced by a template (for validation / UI hinting). */
export function extractMergeTags(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
}

// --- segmentation combine logic --------------------------------------------

/**
 * Combine include/exclude audiences into the final live recipient set: union of
 * all include sets, minus the union of all exclude sets, minus any suppressed
 * ids. Ids are opaque (profile ids or emails). Deterministic, order-preserving
 * by first appearance in the include sets.
 */
export function combineAudience(input: {
  include: Array<Iterable<string | number>>;
  exclude?: Array<Iterable<string | number>>;
  suppressed?: Iterable<string | number>;
}): Array<string | number> {
  const excluded = new Set<string | number>();
  for (const set of input.exclude ?? []) for (const id of set) excluded.add(id);
  for (const id of input.suppressed ?? []) excluded.add(id);

  const seen = new Set<string | number>();
  const out: Array<string | number> = [];
  for (const set of input.include) {
    for (const id of set) {
      if (excluded.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// --- A/B testing ------------------------------------------------------------

/**
 * Deterministically split recipients into variant A / B by a test percentage
 * (portion of the WHOLE audience used for the test, split evenly A/B; the rest
 * get the winner later). splitPercent 100 => everyone is in the test, 50/50.
 * Uses a stable hash of the id so the same recipient always lands the same way.
 */
export function abSplit(ids: Array<string | number>, splitPercent = 100): { a: Array<string | number>; b: Array<string | number>; holdout: Array<string | number> } {
  const a: Array<string | number> = [];
  const b: Array<string | number> = [];
  const holdout: Array<string | number> = [];
  ids.forEach((id, i) => {
    const h = hash(String(id));
    const inTest = (h % 100) < splitPercent;
    if (!inTest) { holdout.push(id); return; }
    // even A/B within the test bucket
    ((h >> 8) % 2 === 0 ? a : b).push(id);
  });
  return { a, b, holdout };
}

export interface VariantStats { sent: number; opened: number; clicked: number }

/** Pick the A/B winner by a metric (click rate, then open rate as tiebreak). */
export function pickAbWinner(a: VariantStats, b: VariantStats): 'A' | 'B' | 'tie' {
  const rate = (s: VariantStats, k: keyof VariantStats) => (s.sent ? s[k] / s.sent : 0);
  const ca = rate(a, 'clicked');
  const cb = rate(b, 'clicked');
  if (ca !== cb) return ca > cb ? 'A' : 'B';
  const oa = rate(a, 'opened');
  const ob = rate(b, 'opened');
  if (oa !== ob) return oa > ob ? 'A' : 'B';
  return 'tie';
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --- engagement filter ------------------------------------------------------

/**
 * Exclude chronically unengaged recipients: keep an id only if it has never
 * been mailed (no lastOpen entry AND no lastSent entry -> keep, they're new) or
 * has opened something on/after the cutoff. An id that was mailed but never
 * opened since the cutoff is dropped.
 */
export function engagementFilter(input: {
  ids: Array<string | number>;
  lastOpenById: Map<string | number, string>;  // id -> ISO date of last open
  lastSentById?: Map<string | number, string>; // id -> ISO date of last send
  cutoffISO: string;
}): Array<string | number> {
  return input.ids.filter((id) => {
    const lastOpen = input.lastOpenById.get(id);
    if (lastOpen) return lastOpen >= input.cutoffISO;
    // Never opened: keep only if we've also never sent to them (still "new").
    return !input.lastSentById?.get(id);
  });
}

// --- pre-send spam check ----------------------------------------------------

export interface SpamWarning { code: string; message: string }

const SPAM_TRIGGER_WORDS = ['free', 'guarantee', 'winner', 'cash', 'act now', 'limited time', 'risk-free', 'click here', 'buy now', '100%'];

/**
 * Warn before the required test email. Flags image-heavy/low-text ratio, missing
 * unsubscribe or sender-ID footer, and risky subject lines (ALL CAPS, excess
 * punctuation/emoji, spam-trigger words). Advisory only - never blocks.
 */
export function spamCheck(input: { subject: string; html: string; isMarketing: boolean }): SpamWarning[] {
  const warnings: SpamWarning[] = [];
  const { subject, html, isMarketing } = input;

  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const imgCount = (html.match(/<img\b/gi) ?? []).length;
  if (imgCount >= 3 && text.length < 200) warnings.push({ code: 'image_heavy', message: 'Image-heavy with little text — many filters penalize this. Add more text.' });
  if (text.length < 40 && imgCount > 0) warnings.push({ code: 'low_text', message: 'Very little text relative to images.' });

  if (isMarketing) {
    if (!/unsubscribe/i.test(html)) warnings.push({ code: 'missing_unsubscribe', message: 'No unsubscribe link found — required on marketing email (CASL).' });
    if (!/\b\d{1,5}\s+\w+/.test(text) || !/(street|st\.|ave|road|rd\.|blvd|drive|dr\.|lane|way|suite|unit|po box|ontario|on\b)/i.test(text)) {
      warnings.push({ code: 'missing_sender_id', message: 'No physical mailing address / sender-ID footer detected — required on marketing email (CASL).' });
    }
  }

  if (subject.length >= 4 && subject === subject.toUpperCase() && /[A-Z]/.test(subject)) warnings.push({ code: 'all_caps_subject', message: 'Subject is ALL CAPS — reads as spam.' });
  if ((subject.match(/[!?]/g) ?? []).length >= 3) warnings.push({ code: 'excess_punctuation', message: 'Excessive punctuation in subject.' });
  if ((subject.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length >= 3) warnings.push({ code: 'excess_emoji', message: 'Too many emoji in subject.' });
  const hits = SPAM_TRIGGER_WORDS.filter((w) => subject.toLowerCase().includes(w));
  if (hits.length) warnings.push({ code: 'trigger_words', message: `Spam-trigger words in subject: ${hits.join(', ')}.` });

  return warnings;
}

// --- email block model (drag-and-drop canvas) ------------------------------

export type EmailBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' }
  | { type: 'columns'; columns: EmailBlock[][] }
  | { type: 'header'; logoUrl?: string; title?: string }
  | { type: 'footer'; html: string }
  | { type: 'social'; links: Array<{ label: string; url: string }> }
  | { type: 'dynamic'; source: string };

/** Render an ordered block array to email HTML, applying merge tags. */
export function renderBlocks(blocks: EmailBlock[], data: Record<string, string | number | null | undefined> = {}): string {
  const mt = (s: string) => renderMergeTags(s, data);
  const one = (b: EmailBlock): string => {
    switch (b.type) {
      case 'text': return `<p style="margin:0 0 16px;line-height:1.5">${mt(b.text)}</p>`;
      case 'image': return `<img src="${b.src}" alt="${b.alt ?? ''}" style="max-width:100%;display:block" />`;
      case 'button': return `<a href="${mt(b.url)}" style="display:inline-block;padding:12px 20px;background:var(--accent,#9E8959);color:#fff;text-decoration:none">${mt(b.label)}</a>`;
      case 'divider': return `<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0" />`;
      case 'columns': return `<table width="100%"><tr>${b.columns.map((col) => `<td style="vertical-align:top;padding:0 8px">${col.map(one).join('')}</td>`).join('')}</tr></table>`;
      case 'header': return `<div style="text-align:center;padding:16px 0">${b.logoUrl ? `<img src="${b.logoUrl}" alt="" style="height:40px" />` : ''}${b.title ? `<h1>${mt(b.title)}</h1>` : ''}</div>`;
      case 'footer': return `<div style="font-size:12px;color:#888;padding:16px 0">${mt(b.html)}</div>`;
      case 'social': return `<div style="padding:8px 0">${b.links.map((l) => `<a href="${l.url}" style="margin:0 6px">${l.label}</a>`).join('')}</div>`;
      case 'dynamic': return `<!-- dynamic:${b.source} -->${mt(`{{${b.source}}}`)}`;
      default: return '';
    }
  };
  return blocks.map(one).join('\n');
}
