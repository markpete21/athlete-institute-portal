'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { BLOCK_TYPES, BLOCK_BY_TYPE, newBlock, slugify, type Block, type BlockType } from '@/lib/site/blocks';
import { deletePageAction, publishPageAction, saveDraftAction, savePageSeoAction, unpublishPageAction, updatePageMetaAction, writeBlockAction, writeSeoAction } from '../../../actions';
import { PreviewButton } from '../../PreviewButton';
import { DESC_MAX, DESC_MIN, TITLE_MAX } from '@/lib/site/constants';

/**
 * The page builder (Module 23 §2.4, ALL CAN §6.1). Left: the block list,
 * drag to reorder, hide, duplicate, delete, add. Right: the inspector for the
 * selected block (typed fields per block type), the Claude block, the page
 * settings and the SEO panel. Draft auto-saves 1.5 s after the last change;
 * Publish validates and copies draft → published.
 */
interface PageMeta { id: number; title: string; slug: string; kind: string; template: string; state: string; blocks: Block[]; hiddenFromMenu: boolean; seo: { title?: string; description?: string; noindex?: boolean }; updatedAt: string; publishedAt: string | null }
interface Refs { locations: { slug: string; name: string }[]; programs: { slug: string; name: string; locationSlug: string }[]; media: { url: string; name: string; alt: string }[]; divisions: { id: number; name: string }[]; pages: { slug: string; title: string }[]; sources: { key: string; label: string }[] }
interface SeoInfo { computedTitle: string; computedDescription: string; issues: { key: string; message: string }[]; keywords: string[]; siteName: string }

type Field =
  | { k: string; l: string; t: 'text' | 'textarea' | 'html' | 'url' | 'number' | 'bool'; hint?: string }
  | { k: string; l: string; t: 'select'; opts: [string, string][] }
  | { k: string; l: string; t: 'image' }
  | { k: string; l: string; t: 'location' | 'program' | 'division' | 'page' }
  | { k: string; l: string; t: 'pairs'; a: string; b: string }
  | { k: string; l: string; t: 'list'; cols: { k: string; l: string; t?: 'image' | 'select'; opts?: [string, string][] }[] };

const FIELDS: Partial<Record<BlockType, Field[]>> = {
  hero: [{ k: 'kicker', l: 'Kicker', t: 'text' }, { k: 'heading', l: 'Headline', t: 'text' }, { k: 'accentWord', l: 'Word in the accent colour', t: 'text', hint: 'e.g. Sport' }, { k: 'subheading', l: 'Line under it', t: 'textarea' }, { k: 'ctaLabel', l: 'Button', t: 'text' }, { k: 'ctaHref', l: 'Button link', t: 'page' }, { k: 'ctaSecondaryLabel', l: 'Second button', t: 'text' }, { k: 'ctaSecondaryHref', l: 'Second link', t: 'page' }, { k: 'imageUrl', l: 'Photo', t: 'image' }, { k: 'imageAlt', l: 'Photo alt text', t: 'text' }, { k: 'credit', l: 'Photo credit', t: 'text' }, { k: 'style', l: 'Style', t: 'select', opts: [['ink', 'On black'], ['photo', 'Photo'], ['paper', 'On white']] }, { k: 'height', l: 'Height', t: 'select', opts: [['short', 'Short'], ['tall', 'Tall']] }],
  rich_text: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'heading', l: 'Heading', t: 'text' }, { k: 'html', l: 'Text', t: 'html' }],
  faq: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'items', l: 'Questions', t: 'list', cols: [{ k: 'q', l: 'Question' }, { k: 'a', l: 'Answer' }, { k: 'note', l: 'Note' }] }, { k: 'openFirst', l: 'Open the first one', t: 'bool' }],
  cta_band: [{ k: 'heading', l: 'Heading', t: 'text' }, { k: 'body', l: 'Line', t: 'textarea' }, { k: 'buttons', l: 'Buttons', t: 'list', cols: [{ k: 'label', l: 'Label' }, { k: 'href', l: 'Link' }, { k: 'style', l: 'Style', t: 'select', opts: [['red', 'Accent'], ['ink', 'Black'], ['line', 'Outline']] }] }, { k: 'background', l: 'Background', t: 'select', opts: [['ink', 'Black'], ['paper', 'White'], ['red', 'Accent']] }],
  stats_band: [{ k: 'items', l: 'Numbers', t: 'list', cols: [{ k: 'label', l: 'Label' }, { k: 'value', l: 'Value' }] }],
  big_buttons: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'buttons', l: 'Buttons', t: 'list', cols: [{ k: 'label', l: 'Label' }, { k: 'href', l: 'Link' }] }],
  why_band: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'mission', l: 'Mission line', t: 'textarea' }, { k: 'pillars', l: 'Pillars', t: 'pairs', a: 'Word', b: 'Tail' }, { k: 'showSports', l: 'Show the sport tiles', t: 'bool' }],
  partners: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'items', l: 'Logos', t: 'list', cols: [{ k: 'name', l: 'Name' }, { k: 'logoUrl', l: 'Logo', t: 'image' }, { k: 'href', l: 'Link' }] }],
  location_list: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'showRequestRow', l: 'Show "Request a location"', t: 'bool' }],
  sport_list: [{ k: 'label', l: 'Section label', t: 'text' }],
  fact_block: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'heading', l: 'Heading', t: 'text' }, { k: 'programSlug', l: 'From a program record', t: 'program' }, { k: 'facts', l: 'Facts (ignored when a record is chosen)', t: 'pairs', a: 'Label', b: 'Value' }, { k: 'note', l: 'Note', t: 'textarea' }],
  season_calendar: [{ k: 'locationSlug', l: 'Location', t: 'location' }, { k: 'items', l: 'Dates (ignored when a location is chosen)', t: 'list', cols: [{ k: 'label', l: 'Label' }, { k: 'value', l: 'Value' }] }],
  interest_form: [{ k: 'programSlug', l: 'Program', t: 'program' }, { k: 'context', l: 'Context line', t: 'text', hint: 'e.g. Basketball at Orangeville' }],
  request_form: [{ k: 'variant', l: 'Form', t: 'select', opts: [['location', 'Request a location'], ['host', 'Host a league'], ['training', 'Training request'], ['assistance', 'Financial assistance'], ['contact', 'Contact']] }, { k: 'heading', l: 'Heading', t: 'text' }, { k: 'note', l: 'Note', t: 'textarea' }],
  program_grid: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'locationSlug', l: 'Location', t: 'location' }, { k: 'sport', l: 'Sport', t: 'select', opts: [['', 'Any'], ['basketball', 'Basketball'], ['volleyball', 'Volleyball'], ['soccer', 'Soccer'], ['flag-football', 'Flag Football']] }, { k: 'limit', l: 'Max', t: 'number' }],
  program_card: [{ k: 'programSlug', l: 'Program', t: 'program' }],
  staff_cards: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'locationSlug', l: 'Location', t: 'location' }, { k: 'programId', l: 'Play program id', t: 'text' }],
  schedule_strip: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'divisionId', l: 'Division', t: 'division' }, { k: 'count', l: 'How many', t: 'number' }],
  standings_table: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'divisionId', l: 'Division', t: 'division' }, { k: 'limit', l: 'Rows', t: 'number' }],
  bracket: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'divisionId', l: 'Division', t: 'division' }],
  news_list: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'count', l: 'How many', t: 'number' }, { k: 'type', l: 'Type', t: 'select', opts: [['', 'All'], ['Announcement', 'Announcements'], ['Feature', 'Features']] }],
  sponsors: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'items', l: 'Logos', t: 'list', cols: [{ k: 'name', l: 'Name' }, { k: 'logoUrl', l: 'Logo', t: 'image' }, { k: 'href', l: 'Link' }] }, { k: 'programId', l: 'Or from a Play league (id)', t: 'text' }],
  image: [{ k: 'imageUrl', l: 'Photo', t: 'image' }, { k: 'alt', l: 'Alt text', t: 'text' }, { k: 'caption', l: 'Caption', t: 'text' }, { k: 'credit', l: 'Credit', t: 'text' }, { k: 'size', l: 'Size', t: 'select', opts: [['wide', 'Wide'], ['narrow', 'Narrow'], ['full', 'Full bleed']] }],
  gallery_grid: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'images', l: 'Photos', t: 'list', cols: [{ k: 'url', l: 'Photo', t: 'image' }, { k: 'alt', l: 'Alt text' }, { k: 'caption', l: 'Caption' }] }],
  video: [{ k: 'url', l: 'YouTube, Vimeo or uploaded file URL', t: 'url' }, { k: 'caption', l: 'Caption', t: 'text' }],
  embed: [{ k: 'url', l: 'URL', t: 'url', hint: 'YouTube, Vimeo, Google Maps or Instagram only' }],
  map: [{ k: 'embedUrl', l: 'Google Maps embed URL', t: 'url' }],
  contact_card: [{ k: 'label', l: 'Section label', t: 'text' }, { k: 'showForm', l: 'Show the contact form', t: 'bool' }],
  spacer: [{ k: 'size', l: 'Size', t: 'select', opts: [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] }],
  divider: [],
  claude: [],
};

const uid = () => Math.random().toString(36).slice(2, 10);
const strOf = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : String(v));

export function PageBuilder({ brand, page, seo, canPublish, canDelete, origin, initialPanel, refs }: { brand: string; page: PageMeta; seo: SeoInfo; canPublish: boolean; canDelete: boolean; origin: string; initialPanel: 'blocks' | 'seo'; refs: Refs }) {
  const [blocks, setBlocks] = useState<Block[]>(page.blocks);
  const [sel, setSel] = useState<string | null>(page.blocks[0]?.id ?? null);
  const [panel, setPanel] = useState<'blocks' | 'page' | 'seo'>(initialPanel);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [issues, setIssues] = useState<{ blockId: string; message: string }[]>([]);
  const [state, setState] = useState(page.state);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(blocks);
  latest.current = blocks;

  const update = useCallback((next: Block[]) => { setBlocks(next); setDirty(true); }, []);
  const save = useCallback(async () => {
    setSaving('saving');
    try {
      const r = await saveDraftAction(brand, page.id, latest.current);
      setIssues(r.issues); setState(r.state); setSaving(r.issues.length ? 'error' : 'saved'); setDirty(false);
    } catch { setSaving('error'); }
  }, [brand, page.id]);
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [blocks, dirty, save]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const cur = blocks.find((b) => b.id === sel) ?? null;
  const setProp = (k: string, v: unknown) => cur && update(blocks.map((b) => (b.id === cur.id ? { ...b, props: { ...b.props, [k]: v } } : b)));
  const add = (type: BlockType, after?: string) => {
    const b = newBlock(type); b.id = uid();
    const i = after ? blocks.findIndex((x) => x.id === after) + 1 : blocks.length;
    update([...blocks.slice(0, i), b, ...blocks.slice(i)]); setSel(b.id); setAdding(false);
  };
  const move = (id: string, dir: -1 | 1) => { const i = blocks.findIndex((b) => b.id === id); const j = i + dir; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; update(n); };
  const drop = (targetId: string) => { if (!drag || drag === targetId) return; const from = blocks.findIndex((b) => b.id === drag), to = blocks.findIndex((b) => b.id === targetId); const n = [...blocks]; const [m] = n.splice(from, 1); n.splice(to, 0, m); update(n); setDrag(null); };
  const publish = () => start(async () => { if (timer.current) clearTimeout(timer.current); const r = await publishPageAction(brand, page.id, latest.current); setIssues(r.issues); if (r.ok) { setState('published'); setDirty(false); setSaving('saved'); } });
  const tbc = useMemo(() => (JSON.stringify(blocks).match(/\[TBC\]/g) ?? []).length, [blocks]);
  const groups = [...new Set(BLOCK_TYPES.map((b) => b.group))];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Link href={`/admin/pages`} className="text-xs text-silver no-underline">← Pages</Link><h2 className="text-xl">{page.title}</h2><span className="mono text-xs text-silver">/{page.slug}</span><span className={`pill-status ${state === 'published' ? 'pos' : state === 'changes' ? 'warn' : 'muted'}`}>{state === 'published' ? 'Published' : state === 'changes' ? 'Unpublished changes' : 'Draft'}</span></div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-silver">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Draft saved' : saving === 'error' ? 'Fix the issues below' : dirty ? 'Unsaved' : ''}</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => void save()} disabled={!dirty}>Save draft</button>
            <PreviewButton brand={brand} path={`/${page.slug}`} label="Preview" />
            {canPublish && <button type="button" className="btn-gold btn-sm" onClick={publish} disabled={pending || (state === 'published' && !dirty)}>{pending ? 'Publishing…' : 'Publish'}</button>}
          </div>
        </div>
        {issues.length > 0 && <ul className="rounded border p-3 text-xs" style={{ borderColor: '#b4483c', color: '#b4483c' }}>{issues.map((i, k) => <li key={k}><button type="button" className="underline" onClick={() => setSel(i.blockId)}>{BLOCK_BY_TYPE[blocks.find((b) => b.id === i.blockId)?.type ?? '']?.label ?? 'Block'}</button>: {i.message}</li>)}</ul>}
        {tbc > 0 && <p className="text-xs text-[#8a6d1f]">{tbc} “[TBC]” on this page. The live site shows “To be confirmed”; replace them before launch.</p>}

        <ol className="flex flex-col gap-1.5" aria-label="Blocks">
          {blocks.map((b, i) => {
            const def = BLOCK_BY_TYPE[b.type];
            const summary = strOf(b.props.heading) || strOf(b.props.label) || strOf(b.props.kicker) || (b.type === 'rich_text' ? strOf(b.props.html).replace(/<[^>]+>/g, ' ').trim().slice(0, 80) : '') || def?.hint || '';
            return (
              <li key={b.id} draggable onDragStart={() => setDrag(b.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(b.id)} className={`card flex items-center gap-3 p-3 ${sel === b.id ? 'ring-1 ring-ink' : ''} ${b.hidden ? 'opacity-60' : ''}`} style={{ cursor: 'grab' }}>
                <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => { setSel(b.id); setPanel('blocks'); }}>
                  <span className="text-sm font-bold">{def?.label ?? b.type}{b.hidden && <span className="tag ml-2 text-[10px]">hidden</span>}{b.type === 'claude' && <span className="tag ml-2 text-[10px]">not published</span>}</span>
                  <span className="truncate text-xs text-silver">{summary}</span>
                </button>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost btn-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(b.id, -1)}>↑</button>
                  <button type="button" className="btn-ghost btn-sm" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(b.id, 1)}>↓</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => update(blocks.map((x) => (x.id === b.id ? { ...x, hidden: !x.hidden } : x)))}>{b.hidden ? 'Show' : 'Hide'}</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { const c = { ...b, id: uid(), props: JSON.parse(JSON.stringify(b.props)) }; update([...blocks.slice(0, i + 1), c, ...blocks.slice(i + 1)]); }}>Copy</button>
                  <button type="button" className="btn-ghost btn-sm" aria-label="Delete block" onClick={() => { update(blocks.filter((x) => x.id !== b.id)); if (sel === b.id) setSel(null); }}>×</button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="relative">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(!adding)}>+ Add a block</button>
          {adding && (
            <div className="card mt-2 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => <div key={g}><p className="label mb-1 text-[10px]">{g}</p><ul className="flex flex-col gap-0.5">{BLOCK_TYPES.filter((t) => t.group === g).map((t) => <li key={t.type}><button type="button" className="w-full rounded px-2 py-1 text-left text-sm hover:bg-paper-panel" onClick={() => add(t.type, sel ?? undefined)}><b>{t.label}</b> <span className="text-xs text-silver">{t.hint}</span></button></li>)}</ul></div>)}
            </div>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        <nav className="seg"><button type="button" className={panel === 'blocks' ? 'on' : ''} onClick={() => setPanel('blocks')}>Block</button><button type="button" className={panel === 'page' ? 'on' : ''} onClick={() => setPanel('page')}>Page</button><button type="button" className={panel === 'seo' ? 'on' : ''} onClick={() => setPanel('seo')}>SEO</button></nav>
        {panel === 'blocks' && (
          <section className="card flex flex-col gap-3 p-4">
            {!cur ? <p className="text-body text-sm">Select a block to edit it, or add one.</p> : cur.type === 'claude' ? <ClaudeBlock brand={brand} pageTitle={page.title} sources={refs.sources} block={cur} onReplace={(html) => update(blocks.map((b) => (b.id === cur.id ? { id: uid(), type: 'rich_text', props: { label: '', heading: '', html } } : b)))} onPrompt={(v) => setProp('prompt', v)} /> : (
              <>
                <div className="card-head"><h3>{BLOCK_BY_TYPE[cur.type]?.label}</h3><span className="card-head-lbl">{BLOCK_BY_TYPE[cur.type]?.hint}</span></div>
                {(FIELDS[cur.type] ?? []).map((f) => <FieldEditor key={f.k} f={f} value={cur.props[f.k]} onChange={(v) => setProp(f.k, v)} refs={refs} />)}
                {!FIELDS[cur.type] && <JsonEditor value={cur.props} onChange={(v) => cur && update(blocks.map((b) => (b.id === cur.id ? { ...b, props: v } : b)))} />}
              </>
            )}
          </section>
        )}
        {panel === 'page' && <PagePanel brand={brand} page={page} canDelete={canDelete} canPublish={canPublish} state={state} />}
        {panel === 'seo' && <SeoPanel brand={brand} page={page} seo={seo} blocks={blocks} origin={origin} />}
      </aside>
    </div>
  );
}

function FieldEditor({ f, value, onChange, refs }: { f: Field; value: unknown; onChange: (v: unknown) => void; refs: Refs }) {
  const id = `f-${f.k}`;
  const L = <label className="field-label" htmlFor={id}>{f.l}</label>;
  switch (f.t) {
    case 'text': case 'url': return <div className="flex flex-col">{L}<input id={id} className="input text-sm" value={strOf(value)} onChange={(e) => onChange(e.target.value)} />{f.hint && <span className="mt-1 text-xs text-silver">{f.hint}</span>}</div>;
    case 'number': return <div className="flex flex-col">{L}<input id={id} type="number" className="input text-sm" value={strOf(value)} onChange={(e) => onChange(Number(e.target.value))} /></div>;
    case 'textarea': return <div className="flex flex-col">{L}<textarea id={id} rows={3} className="input text-sm" value={strOf(value)} onChange={(e) => onChange(e.target.value)} /></div>;
    case 'html': return <HtmlEditor id={id} label={f.l} value={strOf(value)} onChange={onChange} />;
    case 'bool': return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.l}</label>;
    case 'select': return <div className="flex flex-col">{L}<select id={id} className="input text-sm" value={strOf(value)} onChange={(e) => onChange(e.target.value)}>{f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>;
    case 'image': return <ImagePicker id={id} label={f.l} value={strOf(value)} onChange={onChange} media={refs.media} />;
    case 'location': return <div className="flex flex-col">{L}<select id={id} className="input text-sm" value={strOf(value)} onChange={(e) => onChange(e.target.value)}><option value="">None</option>{refs.locations.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}</select></div>;
    case 'program': return <div className="flex flex-col">{L}<select id={id} className="input text-sm" value={strOf(value)} onChange={(e) => onChange(e.target.value)}><option value="">None</option>{refs.programs.map((p) => <option key={p.slug} value={p.slug}>{p.name} · {refs.locations.find((l) => l.slug === p.locationSlug)?.name ?? p.locationSlug}</option>)}</select></div>;
    case 'division': return <div className="flex flex-col">{L}<select id={id} className="input text-sm" value={strOf(value)} onChange={(e) => onChange(e.target.value)}><option value="">All divisions</option>{refs.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>;
    case 'page': return <div className="flex flex-col">{L}<input id={id} list={`${id}-pages`} className="input mono text-xs" value={strOf(value)} onChange={(e) => onChange(e.target.value)} placeholder="/page or https://" /><datalist id={`${id}-pages`}>{refs.pages.map((p) => <option key={p.slug} value={`/${p.slug}`}>{p.title}</option>)}</datalist></div>;
    case 'pairs': {
      const rows = Array.isArray(value) ? (value as [string, string][]) : [];
      return <div className="flex flex-col gap-1"><span className="field-label">{f.l}</span>{rows.map((r, i) => <div key={i} className="flex gap-1"><input className="input text-xs" aria-label={f.a} value={r[0] ?? ''} onChange={(e) => onChange(rows.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} /><input className="input text-xs" aria-label={f.b} value={r[1] ?? ''} onChange={(e) => onChange(rows.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} /><button type="button" className="btn-ghost btn-sm" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button></div>)}<button type="button" className="btn-ghost btn-sm self-start" onClick={() => onChange([...rows, ['', '']])}>+ {f.a}</button></div>;
    }
    case 'list': {
      const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      return <div className="flex flex-col gap-2"><span className="field-label">{f.l}</span>{rows.map((r, i) => <div key={i} className="flex flex-col gap-1 rounded border border-hairline p-2">{f.cols.map((c) => c.t === 'image' ? <ImagePicker key={c.k} id={`${id}-${i}-${c.k}`} label={c.l} value={strOf(r[c.k])} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.k]: v } : x)))} media={refs.media} /> : c.t === 'select' ? <select key={c.k} className="input text-xs" aria-label={c.l} value={strOf(r[c.k])} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.k]: e.target.value } : x)))}>{(c.opts ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : <input key={c.k} className="input text-xs" placeholder={c.l} aria-label={c.l} value={strOf(r[c.k])} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.k]: e.target.value } : x)))} />)}<div className="flex gap-1"><button type="button" className="btn-ghost btn-sm" disabled={i === 0} onClick={() => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}>↑</button><button type="button" className="btn-ghost btn-sm" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button></div></div>)}<button type="button" className="btn-ghost btn-sm self-start" onClick={() => onChange([...rows, Object.fromEntries(f.cols.map((c) => [c.k, '']))])}>+ Add</button></div>;
    }
  }
}

/** Minimal rich text: a contentEditable with bold, italic, link, list, heading; HTML is sanitised again on save. */
function HtmlEditor({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) ref.current.innerHTML = value; }, [value]);
  const cmd = (c: string, arg?: string) => { document.execCommand(c, false, arg); ref.current && onChange(ref.current.innerHTML); };
  return (
    <div className="flex flex-col">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="flex flex-wrap gap-1 border border-b-0 border-hairline p-1">
        {[['bold', 'B'], ['italic', 'I'], ['insertUnorderedList', '• List'], ['insertOrderedList', '1. List']].map(([c, l]) => <button key={c} type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); cmd(c); }}>{l}</button>)}
        <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); cmd('formatBlock', 'h3'); }}>H3</button>
        <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); cmd('formatBlock', 'p'); }}>¶</button>
        <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); const u = prompt('Link URL'); if (u) cmd('createLink', u); }}>Link</button>
        <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); cmd('unlink'); }}>Unlink</button>
      </div>
      <div id={id} ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" className="input min-h-[160px] text-sm" style={{ whiteSpace: 'normal' }} onInput={() => ref.current && onChange(ref.current.innerHTML)} onBlur={() => ref.current && onChange(ref.current.innerHTML)} />
      <span className="mt-1 text-xs text-silver">Paragraphs, bold, italic, links, lists and H3 are kept; everything else is stripped on save.</span>
    </div>
  );
}

function ImagePicker({ id, label, value, onChange, media }: { id: string; label: string; value: string; onChange: (v: string) => void; media: Refs['media'] }) {
  return (
    <div className="flex flex-col">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value && <img src={value} alt="" className="h-10 w-10 rounded object-cover bg-paper-panel" />}
        <select id={id} className="input text-xs" value={value} onChange={(e) => onChange(e.target.value)}><option value="">None</option>{media.map((m) => <option key={m.url} value={m.url}>{m.name}</option>)}{value && !media.some((m) => m.url === value) && <option value={value}>{value}</option>}</select>
      </div>
    </div>
  );
}

function JsonEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const [txt, setTxt] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState('');
  return <div className="flex flex-col"><label className="field-label" htmlFor="f-json">Settings (JSON)</label><textarea id="f-json" className="input mono text-xs" rows={10} value={txt} onChange={(e) => { setTxt(e.target.value); try { onChange(JSON.parse(e.target.value)); setErr(''); } catch { setErr('Not valid JSON yet'); } }} />{err && <span className="text-xs text-[#b4483c]">{err}</span>}</div>;
}

/** Write with Claude (ALL CAN §7.4): prompt + records + length → HTML draft the editor accepts into a Text block. */
function ClaudeBlock({ brand, pageTitle, sources, block, onReplace, onPrompt }: { brand: string; pageTitle: string; sources: Refs['sources']; block: Block; onReplace: (html: string) => void; onPrompt: (v: string) => void }) {
  const [keys, setKeys] = useState<string[]>([]);
  const [len, setLen] = useState('Short (2 paragraphs)');
  const [out, setOut] = useState<{ text: string; tbc: number; source: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="card-head"><h3>Write with Claude</h3><span className="card-head-lbl">Never published as is</span></div>
      <div className="flex flex-col"><label className="field-label" htmlFor="cl-prompt">What should this block say?</label><textarea id="cl-prompt" rows={3} className="input text-sm" value={strOf(block.props.prompt)} onChange={(e) => onPrompt(e.target.value)} placeholder="e.g. Explain who the Orangeville youth league is for and what a season looks like" /></div>
      <div className="flex flex-col"><span className="field-label">Use these records</span><div className="flex max-h-40 flex-col gap-1 overflow-auto text-xs">{sources.map((s) => <label key={s.key} className="flex items-center gap-2"><input type="checkbox" checked={keys.includes(s.key)} onChange={(e) => setKeys(e.target.checked ? [...keys, s.key] : keys.filter((k) => k !== s.key))} /> {s.label}</label>)}</div></div>
      <div className="flex flex-col"><label className="field-label" htmlFor="cl-len">Length</label><select id="cl-len" className="input text-sm" value={len} onChange={(e) => setLen(e.target.value)}><option>Short (2 paragraphs)</option><option>Medium (4 paragraphs)</option><option>Bullets</option></select></div>
      <button type="button" className="btn-gold btn-sm self-start" disabled={pending || strOf(block.props.prompt).trim().length < 5} onClick={() => start(async () => setOut(await writeBlockAction(brand, { prompt: strOf(block.props.prompt), sourceKeys: keys, length: len, pageTitle })))}>{pending ? 'Writing…' : out ? 'Write again' : 'Write'}</button>
      {out && (
        <div className="flex flex-col gap-2 rounded border border-hairline p-3">
          <div className="rich text-sm" dangerouslySetInnerHTML={{ __html: out.text }} />
          <p className="text-xs text-silver">{out.source === 'fallback' ? 'Claude is not connected; this is a placeholder from the records. ' : ''}{out.tbc ? `${out.tbc} fact${out.tbc === 1 ? '' : 's'} marked [TBC] — confirm them before publishing.` : 'Facts come only from the records you chose.'}</p>
          <div className="flex gap-2"><button type="button" className="btn-gold btn-sm" onClick={() => onReplace(out.text)}>Use this text</button><button type="button" className="btn-ghost btn-sm" onClick={() => setOut(null)}>Discard</button></div>
        </div>
      )}
    </div>
  );
}

function PagePanel({ brand, page, canDelete, canPublish, state }: { brand: string; page: PageMeta; canDelete: boolean; canPublish: boolean; state: string }) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [hidden, setHidden] = useState(page.hiddenFromMenu);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const system = page.kind !== 'custom';
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="card-head"><h3>Page</h3><span className="card-head-lbl">{system ? `System page · ${page.template}` : 'Custom page'}</span></div>
      <div className="flex flex-col"><label className="field-label" htmlFor="pg-title">Title</label><input id="pg-title" className="input text-sm" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="flex flex-col"><label className="field-label" htmlFor="pg-slug">Address</label><input id="pg-slug" className="input mono text-xs" value={slug} disabled={system} onChange={(e) => setSlug(e.target.value)} /><span className="mt-1 text-xs text-silver">{system ? 'System pages keep their address.' : 'Changing it adds a redirect from the old address.'}</span></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden from the menu</label>
      <button type="button" className="btn-gold btn-sm self-start" disabled={pending} onClick={() => start(async () => { const r = await updatePageMetaAction(brand, page.id, { title, slug: system ? undefined : slugify(slug), hiddenFromMenu: hidden }); setMsg(r.redirectFrom ? `Saved. /${r.redirectFrom} now redirects here.` : 'Saved.'); })}>{pending ? 'Saving…' : 'Save page settings'}</button>
      {msg && <p className="text-xs text-silver">{msg}</p>}
      <p className="text-xs text-silver">{page.publishedAt ? `Last published ${new Date(page.publishedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}` : 'Never published'}</p>
      {canPublish && state !== 'draft' && <form action={async (fd) => { if (confirm('Unpublish this page? It returns a 404 until published again.')) await unpublishPageAction(fd); }}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={page.id} /><button type="submit" className="btn-ghost btn-sm">Unpublish</button></form>}
      {canDelete && <form action={async (fd) => { if (confirm('Delete this page? Its address will 404 unless you add a redirect.')) await deletePageAction(fd); }}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={page.id} /><button type="submit" className="btn-ghost btn-sm">Delete page</button></form>}
    </section>
  );
}

/** Per-page SEO panel (ALL CAN §6.5): title and description with counters, Google preview, keyword hit, noindex, Write with Claude. */
function SeoPanel({ brand, page, seo, blocks, origin }: { brand: string; page: PageMeta; seo: SeoInfo; blocks: Block[]; origin: string }) {
  const [title, setTitle] = useState(page.seo.title ?? '');
  const [desc, setDesc] = useState(page.seo.description ?? '');
  const [noindex, setNoindex] = useState(!!page.seo.noindex);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const shownTitle = title.trim() || seo.computedTitle;
  const shownDesc = desc.trim() || seo.computedDescription;
  const hit = seo.keywords.find((k) => `${shownTitle} ${shownDesc}`.toLowerCase().includes(k.toLowerCase()));
  const text = blocks.map((b) => [b.props.heading, b.props.subheading, b.props.html, b.props.body, b.props.mission].map(strOf).join(' ')).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="card-head"><h3>SEO</h3><span className="card-head-lbl">{seo.issues.length ? `${seo.issues.length} issue${seo.issues.length === 1 ? '' : 's'}` : 'Looks good'}</span></div>
      {seo.issues.length > 0 && <ul className="text-xs text-[#8a6d1f]">{seo.issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
      <div className="rounded border border-hairline p-3"><p className="text-xs text-silver">{origin.replace(/^https?:\/\//, '')} › {page.slug || 'home'}</p><p className="text-[17px] leading-tight" style={{ color: '#1a0dab' }}>{shownTitle.slice(0, TITLE_MAX)}{shownTitle.length > TITLE_MAX ? '…' : ''}</p><p className="text-xs text-body">{shownDesc.slice(0, DESC_MAX)}{shownDesc.length > DESC_MAX ? '…' : ''}</p></div>
      <div className="flex flex-col"><label className="field-label" htmlFor="seo-title">Search title</label><input id="seo-title" className="input text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={seo.computedTitle} /><span className={`mt-1 text-xs ${shownTitle.length > TITLE_MAX ? 'text-[#b4483c]' : 'text-silver'}`}>{shownTitle.length} / {TITLE_MAX}{!title.trim() && ' · from the site format'}</span></div>
      <div className="flex flex-col"><label className="field-label" htmlFor="seo-desc">Description</label><textarea id="seo-desc" rows={3} className="input text-sm" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={seo.computedDescription} /><span className={`mt-1 text-xs ${shownDesc.length < DESC_MIN || shownDesc.length > DESC_MAX ? 'text-[#b4483c]' : 'text-silver'}`}>{shownDesc.length} · aim for {DESC_MIN} to {DESC_MAX}</span></div>
      <p className="text-xs">{seo.keywords.length === 0 ? <span className="text-silver">Pick keywords under SEO › Site setup to check them here.</span> : hit ? <span className="text-[#3f7a5b]">Uses your keyword “{hit}”.</span> : <span className="text-[#8a6d1f]">Doesn&apos;t use any of your keywords yet.</span>}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} /> Hide from search engines</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-gold btn-sm" disabled={pending} onClick={() => start(async () => { await savePageSeoAction(brand, page.id, { title, description: desc, noindex }); setSaved(true); setTimeout(() => setSaved(false), 2000); })}>{pending ? 'Saving…' : saved ? 'Saved' : 'Save SEO'}</button>
        <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const r = await writeSeoAction(brand, { pageTitle: page.title, pageText: text, keywords: seo.keywords }); setTitle(r.title); setDesc(r.description); })}>Write with Claude</button>
      </div>
    </section>
  );
}
