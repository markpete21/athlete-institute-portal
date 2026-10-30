'use client';

import { useState, useTransition } from 'react';
import type { NavItem, NavInput } from '@/lib/site/nav';
import { DEPTH_MESSAGE } from '@/lib/site/constants';
import { addNavAction, deleteNavAction, moveNavAction, updateNavAction } from '../../actions';
import { PreviewButton } from '../PreviewButton';

interface PageRef { id: number; title: string; slug: string; state: string }

/**
 * Menu tree editor. Each row is draggable; drop on a row's top half = before,
 * bottom half = after, on a folder's middle = inside. Depth is checked here
 * for a friendly message and again in the data layer. Folders render grey,
 * hidden items dimmed, the featured card marked.
 */
export function NavEditor({ brand, tree, pages, images }: { brand: string; tree: NavItem[]; pages: PageRef[]; images: { url: string; name: string }[] }) {
  const [sel, setSel] = useState<NavItem | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ id: number; pos: 'before' | 'after' | 'in' } | null>(null);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const flat: NavItem[] = [];
  const walk = (items: NavItem[]) => { for (const i of items) { flat.push(i); walk(i.children); } };
  walk(tree);
  const depth = (id: number | null): number => { if (id == null) return 0; const p = flat.find((i) => i.id === id); return p ? 1 + depth(p.parentId) : 0; };
  const hasFolderChild = (i: NavItem) => i.children.some((c) => c.kind === 'folder');
  const dropOn = (target: NavItem) => {
    if (drag == null || !over || drag === target.id) return;
    const item = flat.find((i) => i.id === drag)!;
    const parentDepth = over.pos === 'in' ? depth(target.id) + 1 : depth(target.parentId);
    const subtreeDepth = item.kind === 'folder' ? (hasFolderChild(item) ? 2 : 1) : 0;
    if (parentDepth + subtreeDepth > 2 || (over.pos === 'in' && target.kind !== 'folder')) { setMsg(over.pos === 'in' && target.kind !== 'folder' ? 'Only folders can hold items.' : DEPTH_MESSAGE); setOver(null); return; }
    start(async () => { const r = await moveNavAction(brand, drag, { id: target.id, position: over.pos }); setMsg(r.ok ? '' : r.error); setOver(null); setDrag(null); });
  };
  const Row = ({ i, level }: { i: NavItem; level: number }) => (
    <li>
      <div
        draggable onDragStart={() => setDrag(i.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={(e) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; setOver({ id: i.id, pos: i.kind === 'folder' && y > 0.3 && y < 0.7 ? 'in' : y < 0.5 ? 'before' : 'after' }); }}
        onDrop={(e) => { e.preventDefault(); dropOn(i); }}
        onClick={() => setSel(i)}
        className={`flex cursor-grab items-center gap-2 rounded border px-3 py-2 text-sm ${i.kind === 'folder' ? 'bg-paper-panel' : 'bg-white'} ${sel?.id === i.id ? 'border-ink' : 'border-hairline'} ${!i.visible ? 'opacity-50' : ''}`}
        style={{ marginLeft: level * 22, boxShadow: over?.id === i.id ? over.pos === 'before' ? 'inset 0 2px 0 var(--accent)' : over.pos === 'after' ? 'inset 0 -2px 0 var(--accent)' : 'inset 0 0 0 2px var(--accent)' : undefined }}
      >
        <span className="text-silver" aria-hidden="true">⋮⋮</span>
        <span className="font-bold">{i.label}</span>
        <span className="text-xs text-silver">{i.kind === 'folder' ? 'Folder' : i.kind === 'link' ? i.href : `/${pages.find((p) => p.id === i.pageId)?.slug ?? ''}`}</span>
        {i.featured && <span className="tag text-[10px]">featured</span>}
        {i.meta.soon && <span className="tag text-[10px]">soon</span>}
        {!i.visible && <span className="tag text-[10px]">hidden</span>}
        {i.kind === 'page' && pages.find((p) => p.id === i.pageId)?.state === 'draft' && <span className="pill-status warn ml-auto">page not published</span>}
      </div>
      {i.children.length > 0 && <ul className="mt-1 flex flex-col gap-1">{i.children.map((c) => <Row key={c.id} i={c} level={level + 1} />)}</ul>}
    </li>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="card flex flex-col gap-3 p-5">
        <div className="card-head"><h2>Menu</h2><span className="card-head-lbl">Drag to reorder · drop on a folder to move inside</span><span className="ml-auto flex gap-2"><PreviewButton brand={brand} label="Preview" /></span></div>
        {msg && <p className="text-xs" style={{ color: '#b4483c' }}>{msg}</p>}
        <ul className="flex flex-col gap-1">{tree.map((i) => <Row key={i.id} i={i} level={0} />)}</ul>
        <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await addNavAction(brand, { kind: 'folder', label: 'New folder' }); })}>+ Folder</button>
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => { const p = pages.find((x) => !flat.some((f) => f.pageId === x.id)) ?? pages[0]; if (p) start(async () => { await addNavAction(brand, { kind: 'page', label: p.title.replace(/\.$/, ''), pageId: p.id }); }); }}>+ Page</button>
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await addNavAction(brand, { kind: 'link', label: 'New link', href: 'https://' }); })}>+ Link</button>
          <span className="text-xs text-silver">A folder opens a dropdown; a folder inside it is the deepest the menu goes. Empty folders and unpublished pages don&apos;t show on the site.</span>
        </div>
      </section>
      <aside className="card flex flex-col gap-3 p-4">
        {!sel ? <p className="text-body text-sm">Select an item to edit it.</p> : <ItemForm key={sel.id} brand={brand} item={sel} pages={pages} images={images} onDone={() => setSel(null)} />}
      </aside>
    </div>
  );
}

function ItemForm({ brand, item, pages, images, onDone }: { brand: string; item: NavItem; pages: PageRef[]; images: { url: string; name: string }[]; onDone: () => void }) {
  const [v, setV] = useState<Partial<NavInput>>({ label: item.label, pageId: item.pageId, href: item.href, newTab: item.newTab, description: item.description, imageUrl: item.imageUrl, featured: item.featured, visible: item.visible, meta: item.meta });
  const [pending, start] = useTransition();
  const set = (p: Partial<NavInput>) => setV({ ...v, ...p });
  return (
    <>
      <div className="card-head"><h3>{item.kind === 'folder' ? 'Folder' : item.kind === 'link' ? 'Link' : 'Page'}</h3></div>
      <div className="flex flex-col"><label className="field-label" htmlFor="nv-label">Label</label><input id="nv-label" className="input text-sm" value={v.label ?? ''} onChange={(e) => set({ label: e.target.value })} /></div>
      {item.kind === 'page' && <div className="flex flex-col"><label className="field-label" htmlFor="nv-page">Page</label><select id="nv-page" className="input text-sm" value={v.pageId ?? ''} onChange={(e) => set({ pageId: Number(e.target.value) })}>{pages.map((p) => <option key={p.id} value={p.id}>{p.title} · /{p.slug}</option>)}</select></div>}
      {item.kind === 'link' && <><div className="flex flex-col"><label className="field-label" htmlFor="nv-href">URL</label><input id="nv-href" className="input mono text-xs" value={v.href ?? ''} onChange={(e) => set({ href: e.target.value })} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.newTab} onChange={(e) => set({ newTab: e.target.checked })} /> Open in a new tab</label></>}
      {item.kind !== 'folder' && (
        <>
          <div className="flex flex-col"><label className="field-label" htmlFor="nv-desc">Line under it (dropdown)</label><input id="nv-desc" className="input text-sm" value={v.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.featured} onChange={(e) => set({ featured: e.target.checked })} /> Featured card in the dropdown</label>
          {v.featured && <div className="flex flex-col"><label className="field-label" htmlFor="nv-img">Card image</label><select id="nv-img" className="input text-xs" value={v.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value })}><option value="">None</option>{images.map((m) => <option key={m.url} value={m.url}>{m.name}</option>)}</select></div>}
        </>
      )}
      {item.kind === 'folder' && (
        <>
          <div className="flex flex-col"><label className="field-label" htmlFor="nv-sport">Sport (Play tabs)</label><select id="nv-sport" className="input text-sm" value={v.meta?.sport ?? ''} onChange={(e) => set({ meta: { ...v.meta, sport: e.target.value || undefined } })}><option value="">Not a sport tab</option><option value="basketball">Basketball</option><option value="volleyball">Volleyball</option><option value="soccer">Soccer</option><option value="flag-football">Flag Football</option></select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.meta?.soon} onChange={(e) => set({ meta: { ...v.meta, soon: e.target.checked } })} /> Mark as coming soon</label>
          <div className="flex flex-col"><label className="field-label" htmlFor="nv-note">Note (shown in the dropdown)</label><input id="nv-note" className="input text-sm" value={v.meta?.note ?? ''} onChange={(e) => set({ meta: { ...v.meta, note: e.target.value || undefined } })} /></div>
        </>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.visible !== false} onChange={(e) => set({ visible: e.target.checked })} /> Visible in the menu</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-gold btn-sm" disabled={pending} onClick={() => start(async () => { await updateNavAction(brand, item.id, v); onDone(); })}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm(item.children.length ? 'Delete this folder and everything inside it?' : 'Remove this item from the menu?')) start(async () => { await deleteNavAction(brand, item.id); onDone(); }); }}>Delete</button>
      </div>
    </>
  );
}
