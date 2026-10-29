/**
 * Page builder block schema + the ONE validator (Module 23 §5). Both the admin
 * editor action and the public renderer import this, so an unknown block type,
 * unsafe HTML, a non-allowlisted embed or a bad URL can never be saved or
 * rendered. Hand-rolled (no zod/sanitize-html in the dependency set) and
 * edge-safe: pure functions over plain data.
 */

export type BlockType =
  | 'hero' | 'rich_text' | 'columns' | 'image' | 'gallery_grid' | 'video' | 'cta_band'
  | 'program_grid' | 'program_card' | 'standings_table' | 'schedule_strip' | 'bracket'
  | 'news_list' | 'sponsors' | 'staff_cards' | 'faq' | 'stats_band' | 'contact_card'
  | 'map' | 'embed' | 'spacer' | 'divider'
  // Brand-site specifics (every theme renders these too)
  | 'why_band' | 'partners' | 'location_list' | 'sport_list' | 'fact_block'
  | 'season_calendar' | 'interest_form' | 'big_buttons' | 'request_form'
  // Editor-only: a Claude draft in progress. Never rendered publicly.
  | 'claude';

export interface Block {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  hidden?: boolean;
}

export interface BlockTypeDef {
  type: BlockType;
  label: string;
  group: 'Claude' | 'Content' | 'Locations & programs' | 'Compete' | 'Media' | 'Layout';
  hint: string;
  /** Default props for a freshly added block. */
  defaults: Record<string, unknown>;
}

export const BLOCK_TYPES: BlockTypeDef[] = [
  { type: 'claude', label: 'Write with Claude', group: 'Claude', hint: 'Draft copy from this site\'s records, then review it.', defaults: { prompt: '' } },
  { type: 'hero', label: 'Hero', group: 'Content', hint: 'Headline, kicker, image and one action', defaults: { style: 'ink', heading: 'Headline.', kicker: '', subheading: '', ctaLabel: '', ctaHref: '', height: 'short' } },
  { type: 'rich_text', label: 'Text', group: 'Content', hint: 'Formatted paragraphs', defaults: { label: '', heading: '', html: '<p></p>' } },
  { type: 'columns', label: 'Columns', group: 'Layout', hint: '2 to 4 columns of text or images', defaults: { columns: [[], []] } },
  { type: 'faq', label: 'FAQ', group: 'Content', hint: 'Questions and answers', defaults: { label: '', items: [{ q: 'Question?', a: 'Answer.', note: '' }], openFirst: true } },
  { type: 'cta_band', label: 'Call to action', group: 'Content', hint: 'Heading, line and buttons', defaults: { heading: 'Next step.', body: '', buttons: [{ label: 'Learn more', href: '/', style: 'red' }], background: 'ink' } },
  { type: 'stats_band', label: 'Numbers', group: 'Content', hint: 'Label and value tiles', defaults: { items: [{ label: 'Locations', value: '2' }] } },
  { type: 'big_buttons', label: 'Big buttons', group: 'Content', hint: 'Two or three large pill buttons', defaults: { label: '', buttons: [{ label: 'Schedules & Results', href: '/scores' }, { label: 'Standings', href: '/standings' }] } },
  { type: 'why_band', label: 'Why band', group: 'Content', hint: 'Mission, pillars and the sport tiles', defaults: { label: 'Why ALL CAN', mission: '', pillars: [['Play.', 'For life.'], ['Compete.', 'Together.'], ['Grow.', 'Every day.']], showSports: true } },
  { type: 'partners', label: 'Partners', group: 'Content', hint: 'Logo band on black', defaults: { label: 'Partners', items: [] } },
  { type: 'location_list', label: 'Location list', group: 'Locations & programs', hint: 'Every published location with its status', defaults: { label: 'Locations', showRequestRow: true } },
  { type: 'sport_list', label: 'Sport list', group: 'Locations & programs', hint: 'The four sports and their programs', defaults: {} },
  { type: 'fact_block', label: 'Fact block', group: 'Locations & programs', hint: 'Label and value rows, from a record or typed in', defaults: { label: '', heading: '', facts: [['Ages', '[TBC]']], note: '', programSlug: '' } },
  { type: 'season_calendar', label: 'Season calendar', group: 'Locations & programs', hint: 'Key dates for a location', defaults: { locationSlug: '', items: [] } },
  { type: 'interest_form', label: 'Interest form', group: 'Locations & programs', hint: 'Get notified when registration opens', defaults: { programSlug: '', context: '' } },
  { type: 'request_form', label: 'Request form', group: 'Locations & programs', hint: 'Request a location, host a program, training or assistance', defaults: { variant: 'location', heading: '', note: '' } },
  { type: 'program_grid', label: 'Program list', group: 'Locations & programs', hint: 'Programs from the records, filtered', defaults: { locationSlug: '', sport: '', limit: 12 } },
  { type: 'program_card', label: 'Program block', group: 'Locations & programs', hint: 'One program with its fact block', defaults: { programSlug: '' } },
  { type: 'staff_cards', label: 'Coaches', group: 'Locations & programs', hint: 'Public coach profiles for a program or location', defaults: { locationSlug: '', programId: '' } },
  { type: 'schedule_strip', label: 'Schedule strip', group: 'Compete', hint: 'Next games, site-wide or one division', defaults: { count: 6, divisionId: '' } },
  { type: 'standings_table', label: 'Standings', group: 'Compete', hint: 'One division\'s table', defaults: { divisionId: '', limit: 8 } },
  { type: 'bracket', label: 'Bracket', group: 'Compete', hint: 'A tournament division\'s bracket', defaults: { divisionId: '' } },
  { type: 'news_list', label: 'Stories', group: 'Content', hint: 'Latest stories', defaults: { count: 3, type: '' } },
  { type: 'sponsors', label: 'Sponsors', group: 'Content', hint: 'Sponsor logos, typed or from a league', defaults: { items: [], programId: '' } },
  { type: 'image', label: 'Photo', group: 'Media', hint: 'One photo with a caption', defaults: { imageUrl: '', alt: '', caption: '', credit: '', size: 'wide' } },
  { type: 'gallery_grid', label: 'Photo grid', group: 'Media', hint: 'Several photos', defaults: { images: [] } },
  { type: 'video', label: 'Video', group: 'Media', hint: 'YouTube, Vimeo or an uploaded file', defaults: { url: '' } },
  { type: 'embed', label: 'Embed', group: 'Media', hint: 'YouTube, Vimeo, Google Maps or Instagram', defaults: { url: '' } },
  { type: 'map', label: 'Map', group: 'Media', hint: 'Google Maps embed', defaults: { embedUrl: '' } },
  { type: 'contact_card', label: 'Contact', group: 'Content', hint: 'Email, phone and address from site settings', defaults: { showForm: false } },
  { type: 'spacer', label: 'Space', group: 'Layout', hint: 'Vertical space', defaults: { size: 'md' } },
  { type: 'divider', label: 'Hairline', group: 'Layout', hint: 'A rule across the page', defaults: {} },
];

export const BLOCK_BY_TYPE: Record<string, BlockTypeDef> = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b]));

/** Hosts an iframe or video may point at. Anything else is refused at save. */
export const EMBED_HOSTS = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'vimeo.com', 'www.google.com', 'maps.google.com', 'www.instagram.com', 'instagram.com'];

// ---------------------------------------------------------------------------
// HTML sanitiser - allowlist of tags and attributes, no scripts, no styles.
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'figure', 'figcaption', 'img', 'span']);
const VOID = new Set(['br', 'img']);

function safeUrl(raw: string, allowRelative = true): string | null {
  const v = raw.trim().replace(/[\u0000-\u001f]/g, '');
  if (!v) return null;
  if (/^(javascript|data|vbscript):/i.test(v)) return null;
  if (/^(https?:)?\/\//i.test(v)) return v;
  if (/^mailto:|^tel:/i.test(v)) return v;
  if (allowRelative && (v.startsWith('/') || v.startsWith('#'))) return v;
  return null;
}

/**
 * Keep only allowlisted tags and attributes. Unknown tags are dropped but their
 * text is kept; attributes are rebuilt from scratch (never copied), so event
 * handlers, styles and tracking attributes never survive.
 */
export function sanitizeHtml(input: string): string {
  const src = String(input ?? '');
  const out: string[] = [];
  const open: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[3] !== undefined) { out.push(m[3].replace(/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+|nbsp|middot|rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip);)/gi, '&amp;')); continue; }
    if (m[0] === '<') { out.push('&lt;'); continue; }
    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (closing) {
      if (VOID.has(tag)) continue;
      const idx = open.lastIndexOf(tag);
      if (idx === -1) continue;
      while (open.length > idx) out.push(`</${open.pop()}>`);
      continue;
    }
    const attrs: string[] = [];
    const attrSrc = m[2] ?? '';
    const get = (name: string) => {
      const a = attrSrc.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
      return a ? (a[2] ?? a[3] ?? a[4] ?? '') : null;
    };
    if (tag === 'a') {
      const href = get('href');
      const safe = href ? safeUrl(href) : null;
      if (safe) {
        attrs.push(`href="${escapeAttr(safe)}"`);
        if (/^https?:\/\//i.test(safe)) attrs.push('target="_blank"', 'rel="noopener"');
      }
    } else if (tag === 'img') {
      const s = get('src');
      const safe = s ? safeUrl(s) : null;
      if (!safe) continue;
      attrs.push(`src="${escapeAttr(safe)}"`, `alt="${escapeAttr(get('alt') ?? '')}"`, 'loading="lazy"');
    }
    out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
    if (!VOID.has(tag)) open.push(tag);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function stripHtml(html: string): string {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue { blockId: string; message: string }

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : d;
};
const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);
const href = (v: unknown, issues: ValidationIssue[], id: string, label: string): string => {
  const raw = str(v, 2000);
  if (!raw) return '';
  const safe = safeUrl(raw);
  if (!safe) issues.push({ blockId: id, message: `${label} isn't a valid address.` });
  return safe ?? '';
};
const imageUrl = (v: unknown, issues: ValidationIssue[], id: string): string => {
  const raw = str(v, 2000);
  if (!raw) return '';
  const safe = safeUrl(raw);
  if (!safe) { issues.push({ blockId: id, message: 'Image address isn\'t valid.' }); return ''; }
  if (/\.svg(\?|$)/i.test(safe)) { issues.push({ blockId: id, message: 'SVG images aren\'t allowed.' }); return ''; }
  return safe;
};
const embedUrl = (v: unknown, issues: ValidationIssue[], id: string): string => {
  const raw = str(v, 2000);
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !EMBED_HOSTS.includes(u.hostname)) {
      issues.push({ blockId: id, message: `Embeds are allowed only from ${EMBED_HOSTS.filter((h) => !h.startsWith('www.')).join(', ')}.` });
      return '';
    }
    return u.toString();
  } catch {
    issues.push({ blockId: id, message: 'Embed address isn\'t valid.' });
    return '';
  }
};
const pairs = (v: unknown, maxItems = 40): [string, string][] =>
  Array.isArray(v)
    ? v.slice(0, maxItems).map((p) => (Array.isArray(p) ? [str(p[0], 200), str(p[1], 1000)] : ['', ''])).filter((p) => p[0] || p[1]) as [string, string][]
    : [];
const buttons = (v: unknown, issues: ValidationIssue[], id: string, max = 4) =>
  Array.isArray(v)
    ? v.slice(0, max).map((b) => {
        const o = (b ?? {}) as Record<string, unknown>;
        return { label: str(o.label, 80), href: href(o.href, issues, id, 'Button link'), style: ['red', 'ink', 'line'].includes(String(o.style)) ? String(o.style) : 'ink' };
      }).filter((b) => b.label)
    : [];

/**
 * Validate and normalise a block list. Returns the cleaned blocks plus any
 * issues; unknown types are dropped with an issue so a save never silently
 * loses them.
 */
export function validateBlocks(input: unknown, depth = 0): { blocks: Block[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const blocks: Block[] = [];
  if (!Array.isArray(input)) return { blocks, issues: [{ blockId: '', message: 'Blocks must be a list.' }] };
  const seen = new Set<string>();
  for (const raw of input.slice(0, 200)) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const type = String(b.type ?? '') as BlockType;
    let id = str(b.id, 60).replace(/[^a-zA-Z0-9_-]/g, '') || `b-${Math.random().toString(36).slice(2, 10)}`;
    while (seen.has(id)) id = `${id}-${Math.random().toString(36).slice(2, 5)}`;
    seen.add(id);
    if (!BLOCK_BY_TYPE[type]) { issues.push({ blockId: id, message: `Unknown block type "${type}".` }); continue; }
    const p = (b.props ?? {}) as Record<string, unknown>;
    let props: Record<string, unknown> = {};
    switch (type) {
      case 'hero':
        props = {
          style: ['photo', 'ink'].includes(String(p.style)) ? String(p.style) : 'ink',
          kicker: str(p.kicker, 120), heading: str(p.heading, 200), subheading: str(p.subheading, 400),
          headingLines: Array.isArray(p.headingLines) ? p.headingLines.slice(0, 3).map((l) => str(l, 120)) : undefined,
          accentWord: str(p.accentWord, 40),
          imageUrl: imageUrl(p.imageUrl, issues, id), imageAlt: str(p.imageAlt, 400), credit: str(p.credit, 200),
          wordmarkUrl: imageUrl(p.wordmarkUrl, issues, id), wordmarkAlt: str(p.wordmarkAlt, 80),
          logoUrl: imageUrl(p.logoUrl, issues, id),
          ctaLabel: str(p.ctaLabel, 80), ctaHref: href(p.ctaHref, issues, id, 'Action link'),
          ctaSecondaryLabel: str(p.ctaSecondaryLabel, 80), ctaSecondaryHref: href(p.ctaSecondaryHref, issues, id, 'Second action link'),
          height: ['full', 'short'].includes(String(p.height)) ? String(p.height) : 'short',
        };
        break;
      case 'rich_text':
        props = { label: str(p.label, 80), heading: str(p.heading, 200), html: sanitizeHtml(str(p.html, 40000)), width: ['narrow', 'wide'].includes(String(p.width)) ? String(p.width) : 'narrow' };
        break;
      case 'columns': {
        if (depth > 0) { issues.push({ blockId: id, message: 'Columns can\'t be nested.' }); continue; }
        const cols = Array.isArray(p.columns) ? p.columns.slice(0, 4) : [];
        props = { columns: cols.map((c) => { const r = validateBlocks(c, depth + 1); issues.push(...r.issues); return r.blocks.filter((x) => ['rich_text', 'image', 'cta_band', 'faq', 'fact_block'].includes(x.type)); }) };
        break;
      }
      case 'image':
        props = { imageUrl: imageUrl(p.imageUrl, issues, id), alt: str(p.alt, 400), caption: str(p.caption, 400), credit: str(p.credit, 200), size: ['wide', 'narrow', 'full'].includes(String(p.size)) ? String(p.size) : 'wide', href: href(p.href, issues, id, 'Photo link') };
        if (props.imageUrl && !props.alt) issues.push({ blockId: id, message: 'Photo needs alt text.' });
        break;
      case 'gallery_grid':
        props = { images: (Array.isArray(p.images) ? p.images.slice(0, 24) : []).map((im) => { const o = (im ?? {}) as Record<string, unknown>; return { url: imageUrl(o.url, issues, id), alt: str(o.alt, 400) }; }).filter((im) => im.url), programId: num(p.programId, 0, 0, 1e9) || '' };
        break;
      case 'video': {
        const u = str(p.url, 2000);
        props = { url: u && /\.(mp4|webm)(\?|$)/i.test(u) ? (safeUrl(u) ?? '') : embedUrl(u, issues, id) };
        break;
      }
      case 'cta_band':
        props = { heading: str(p.heading, 200), body: str(p.body, 600), buttons: buttons(p.buttons, issues, id), background: ['ink', 'white', 'red'].includes(String(p.background)) ? String(p.background) : 'ink' };
        break;
      case 'program_grid':
        props = { label: str(p.label, 80), locationSlug: str(p.locationSlug, 80), sport: str(p.sport, 40), limit: num(p.limit, 12, 1, 50) };
        break;
      case 'program_card':
        props = { programSlug: str(p.programSlug, 120), open: bool(p.open, true) };
        break;
      case 'standings_table':
        props = { divisionId: num(p.divisionId, 0, 0, 1e9) || '', limit: num(p.limit, 8, 1, 30) };
        break;
      case 'schedule_strip':
        props = { label: str(p.label, 80), count: num(p.count, 6, 1, 20), divisionId: num(p.divisionId, 0, 0, 1e9) || '' };
        break;
      case 'bracket':
        props = { divisionId: num(p.divisionId, 0, 0, 1e9) || '' };
        break;
      case 'news_list':
        props = { label: str(p.label, 80), count: num(p.count, 3, 1, 12), type: str(p.type, 40) };
        break;
      case 'sponsors':
        props = { label: str(p.label, 80), items: (Array.isArray(p.items) ? p.items.slice(0, 20) : []).map((s) => { const o = (s ?? {}) as Record<string, unknown>; return { name: str(o.name, 120), logoUrl: imageUrl(o.logoUrl, issues, id), href: href(o.href, issues, id, 'Sponsor link') }; }).filter((s) => s.name), programId: num(p.programId, 0, 0, 1e9) || '' };
        break;
      case 'staff_cards':
        props = { label: str(p.label, 80), locationSlug: str(p.locationSlug, 80), programId: num(p.programId, 0, 0, 1e9) || '' };
        break;
      case 'faq':
        props = { label: str(p.label, 80), openFirst: bool(p.openFirst, true), items: (Array.isArray(p.items) ? p.items.slice(0, 40) : []).map((f) => { const o = (f ?? {}) as Record<string, unknown>; return { q: str(o.q, 300), a: str(o.a, 2000), note: str(o.note, 600) }; }).filter((f) => f.q) };
        break;
      case 'stats_band':
        props = { items: (Array.isArray(p.items) ? p.items.slice(0, 8) : []).map((s) => { const o = (s ?? {}) as Record<string, unknown>; return { label: str(o.label, 80), value: str(o.value, 40) }; }).filter((s) => s.label) };
        break;
      case 'contact_card':
        props = { showForm: bool(p.showForm, false), label: str(p.label, 80) };
        break;
      case 'map':
        props = { embedUrl: embedUrl(p.embedUrl, issues, id) };
        break;
      case 'embed':
        props = { url: embedUrl(p.url, issues, id) };
        break;
      case 'spacer':
        props = { size: ['sm', 'md', 'lg'].includes(String(p.size)) ? String(p.size) : 'md' };
        break;
      case 'divider':
        props = {};
        break;
      case 'why_band':
        props = { label: str(p.label, 80), mission: str(p.mission, 400), pillars: pairs(p.pillars, 3), showSports: bool(p.showSports, true) };
        break;
      case 'partners':
        props = { label: str(p.label, 80), items: (Array.isArray(p.items) ? p.items.slice(0, 12) : []).map((s) => { const o = (s ?? {}) as Record<string, unknown>; const f = Number(o.factor); return { name: str(o.name, 120), logoUrl: imageUrl(o.logoUrl, issues, id), factor: Number.isFinite(f) && f > 0 && f <= 2 ? f : 1, href: href(o.href, issues, id, 'Partner link') }; }).filter((s) => s.logoUrl) };
        break;
      case 'location_list':
        props = { label: str(p.label, 80) || 'Locations', showRequestRow: bool(p.showRequestRow, true) };
        break;
      case 'sport_list':
        props = { label: str(p.label, 80) };
        break;
      case 'fact_block':
        props = { label: str(p.label, 80), heading: str(p.heading, 200), facts: pairs(p.facts), note: str(p.note, 600), programSlug: str(p.programSlug, 120), locationSlug: str(p.locationSlug, 80) };
        break;
      case 'season_calendar':
        props = { label: str(p.label, 80) || 'Season calendar', locationSlug: str(p.locationSlug, 80), items: pairs(p.items, 12) };
        break;
      case 'interest_form':
        props = { programSlug: str(p.programSlug, 120), context: str(p.context, 120), heading: str(p.heading, 120) };
        break;
      case 'big_buttons':
        props = { label: str(p.label, 80), buttons: buttons(p.buttons, issues, id, 3) };
        break;
      case 'request_form':
        props = { variant: ['location', 'training', 'assistance', 'contact'].includes(String(p.variant)) ? String(p.variant) : 'location', heading: str(p.heading, 120), note: str(p.note, 400) };
        break;
      case 'claude':
        props = { prompt: str(p.prompt, 2000), sources: Array.isArray(p.sources) ? p.sources.slice(0, 10).map((s) => str(s, 80)) : [], length: str(p.length, 40), out: str(p.out, 8000) };
        break;
    }
    blocks.push({ id, type, props, ...(b.hidden ? { hidden: true } : {}) });
  }
  return { blocks, issues };
}

/** Blocks that render publicly: visible, and never the editor-only Claude block. */
export function publicBlocks(blocks: Block[]): Block[] {
  return blocks.filter((b) => !b.hidden && b.type !== 'claude');
}

/** One-line summary for the editor's block list. */
export function blockSummary(b: Block): string {
  const p = b.props as Record<string, unknown>;
  const first = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  switch (b.type) {
    case 'hero': return first(p.heading) || (Array.isArray(p.headingLines) ? (p.headingLines as string[]).join(' ') : '') || 'Hero';
    case 'rich_text': return first(p.heading) || stripHtml(first(p.html)).slice(0, 80) || 'Text';
    case 'faq': return `${(p.items as unknown[])?.length ?? 0} questions`;
    case 'cta_band': return first(p.heading) || 'Call to action';
    case 'fact_block': return first(p.heading) || first(p.label) || 'Fact block';
    case 'why_band': return first(p.mission).slice(0, 80) || 'Why band';
    case 'partners': return `${(p.items as unknown[])?.length ?? 0} partner logos`;
    case 'big_buttons': return ((p.buttons as { label: string }[]) ?? []).map((x) => x.label).join(' · ') || 'Buttons';
    case 'program_card': return first(p.programSlug) || 'Program block';
    case 'interest_form': return first(p.context) || 'Get notified when registration opens';
    case 'request_form': return `Request form · ${first(p.variant) || 'location'}`;
    case 'image': return first(p.caption) || first(p.alt) || 'Photo';
    case 'claude': return first(p.prompt).slice(0, 80) || 'Write with Claude';
    default: return BLOCK_BY_TYPE[b.type]?.label ?? b.type;
  }
}

export function newBlock(type: BlockType): Block {
  const def = BLOCK_BY_TYPE[type];
  return { id: `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, props: JSON.parse(JSON.stringify(def?.defaults ?? {})) };
}

/** Site-relative slug from a title: lowercase, hyphens, no leading slash. */
export function slugify(t: string): string {
  return String(t ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9/]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').replace(/^\/+|\/+$/g, '').slice(0, 80);
}

/** Reserved first path segments on a brand site: a custom page can't take them. */
export const RESERVED_SLUGS = new Set(['locations', 'scores', 'schedule', 'results', 'standings', 'rosters', 'teams', 'players', 'leagues', 'programs', 'register', 'stories', 'news', 'my-teams', 'sign-in', 'sign-up', 'api', 'preview', 'sitemap.xml', 'robots.txt', 'opengraph-image', 'site', 'admin', 'display']);
