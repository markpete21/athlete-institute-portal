'use client';

import { useMemo, useState, useTransition } from 'react';
import type { SiteMedia } from '@/lib/site/media';
import { deleteMediaAction, describeImageAction, updateMediaAction, uploadMediaAction } from '../../actions';

type Item = SiteMedia & { usedOn: string[]; missingAlt: boolean };
const kb = (n: number | null) => (n == null ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`);

export function MediaLibrary({ brand, items, folders }: { brand: string; items: Item[]; folders: string[] }) {
  const [folder, setFolder] = useState<string>('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const list = useMemo(() => items.filter((m) => (!folder || m.folder === folder) && (!q || m.name.toLowerCase().includes(q.toLowerCase()) || (m.alt ?? '').toLowerCase().includes(q.toLowerCase()))), [items, folder, q]);
  const cur = items.find((m) => m.id === sel) ?? null;
  const missing = items.filter((m) => m.missingAlt).length;
  const upload = (fd: FormData) => start(async () => { const r = await uploadMediaAction(fd); setErrors(r.errors); });
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card flex flex-col gap-4 p-5 lg:col-span-2">
        <div className="card-head"><h2>Media</h2><span className="card-head-lbl">{items.length} files{missing ? ` · ${missing} missing alt text` : ''}</span></div>
        <form action={upload} className="flex flex-wrap items-end gap-2 rounded border border-dashed border-hairline p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const fd = new FormData(); fd.set('brand', brand); fd.set('folder', folder || 'Uploads'); for (const f of Array.from(e.dataTransfer.files)) fd.append('files', f); upload(fd); }}>
          <input type="hidden" name="brand" value={brand} />
          <div className="flex flex-col"><label className="field-label" htmlFor="md-files">Add files</label><input id="md-files" name="files" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/webm" className="input text-sm" /></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="md-folder">Folder</label><select id="md-folder" name="folder" defaultValue={folder || 'Uploads'} className="input text-sm">{folders.map((f) => <option key={f}>{f}</option>)}</select></div>
          <button type="submit" className="btn-gold btn-sm" disabled={pending}>{pending ? 'Uploading…' : 'Upload'}</button>
          <span className="text-xs text-silver">Or drop files here. JPG, PNG, WebP, PDF, MP4. No SVG.</span>
        </form>
        {errors.length > 0 && <ul className="text-xs" style={{ color: '#b4483c' }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="flex flex-wrap items-center gap-2">
          <nav className="seg"><button type="button" className={!folder ? 'on' : ''} onClick={() => setFolder('')}>All</button>{folders.map((f) => <button key={f} type="button" className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>{f}</button>)}</nav>
          <input className="input text-sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search media" />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {list.map((m) => (
            <button key={m.id} type="button" onClick={() => setSel(m.id)} className={`flex flex-col gap-1 rounded border p-1.5 text-left ${sel === m.id ? 'border-ink' : 'border-hairline'}`}>
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-paper-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.kind === 'photo' || m.kind === 'logo' ? <img src={m.url} alt={m.alt ?? ''} className="h-full w-full object-cover" loading="lazy" /> : <span className="mono text-xs text-silver">{m.kind}</span>}
              </div>
              <span className="truncate text-xs">{m.name}</span>
              {m.missingAlt && <span className="pill-status warn" style={{ fontSize: 9 }}>No alt</span>}
            </button>
          ))}
          {list.length === 0 && <p className="col-span-full text-body text-sm">Nothing here yet.</p>}
        </div>
      </section>
      <section className="card flex flex-col gap-3 p-5">
        {!cur ? <p className="text-body text-sm">Choose a file to edit its alt text, replace it everywhere or delete it.</p> : (
          <>
            <div className="card-head"><h2 className="truncate">{cur.name}</h2></div>
            {(cur.kind === 'photo' || cur.kind === 'logo') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cur.url} alt={cur.alt ?? ''} className="max-h-48 w-full rounded object-contain bg-paper-panel" />
            )}
            <p className="text-xs text-silver">{cur.kind}{cur.width ? ` · ${cur.width}×${cur.height}` : ''}{cur.bytes ? ` · ${kb(cur.bytes)}` : ''} · {cur.folder}</p>
            <form action={async (fd) => { await updateMediaAction(fd); }} className="flex flex-col gap-2">
              <input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={cur.id} />
              <div className="flex flex-col"><label className="field-label" htmlFor="md-alt">Alt text</label><input id="md-alt" name="alt" defaultValue={cur.alt ?? ''} className="input text-sm" key={cur.id} placeholder="What a screen reader should say" /></div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="decorative" defaultChecked={cur.decorative} /> Decorative (no alt needed)</label>
              <div className="flex flex-col"><label className="field-label" htmlFor="md-credit">Credit</label><input id="md-credit" name="credit" defaultValue={cur.credit ?? ''} className="input text-sm" /></div>
              <div className="flex flex-col"><label className="field-label" htmlFor="md-fold">Folder</label><select id="md-fold" name="folder" defaultValue={cur.folder} className="input text-sm">{folders.map((f) => <option key={f}>{f}</option>)}</select></div>
              <div className="flex flex-wrap gap-2"><button type="submit" className="btn-gold btn-sm">Save</button>
                {cur.kind === 'photo' && <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const alt = await describeImageAction(brand, cur.id, cur.url, cur.name); (document.getElementById('md-alt') as HTMLInputElement).value = alt; })}>Describe with Claude</button>}</div>
            </form>
            <form action={upload} className="flex flex-col gap-1 border-t border-hairline pt-3">
              <input type="hidden" name="brand" value={brand} /><input type="hidden" name="replaceId" value={cur.id} /><input type="hidden" name="folder" value={cur.folder} />
              <label className="field-label" htmlFor="md-replace">Replace everywhere</label>
              <div className="flex gap-2"><input id="md-replace" name="files" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/webm" className="input text-xs" /><button type="submit" className="btn-ghost btn-sm" disabled={pending}>Replace</button></div>
              <span className="text-xs text-silver">Every page using this file switches to the new one.</span>
            </form>
            <div className="border-t border-hairline pt-3 text-xs">
              <p className="label mb-1 text-[10px]">Used on</p>
              {cur.usedOn.length ? <ul>{cur.usedOn.map((u) => <li key={u}>{u}</li>)}</ul> : <p className="text-silver">Not used on any page.</p>}
            </div>
            <form action={async (fd) => { if (confirm('Delete this file?')) await deleteMediaAction(fd); }}>
              <input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={cur.id} />
              <button type="submit" className="btn-ghost btn-sm" disabled={cur.usedOn.length > 0} title={cur.usedOn.length ? 'Remove it from those pages first' : undefined}>Delete</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
