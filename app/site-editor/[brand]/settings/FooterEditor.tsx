'use client';

import { useState } from 'react';
import { saveSettingsAction } from '../../actions';
import type { FooterColumn } from '@/lib/site/sites';

/** Footer columns as editable rows; saved as JSON through the settings action. */
export function FooterEditor({ brand, columns, tagline, legalText, partners }: { brand: string; columns: FooterColumn[]; tagline: string; legalText: string; partners: boolean }) {
  const [cols, setCols] = useState<FooterColumn[]>(columns.length ? columns : [{ title: 'Play', items: [] }]);
  const setCol = (i: number, c: FooterColumn) => setCols(cols.map((x, j) => (j === i ? c : x)));
  return (
    <form action={async (fd) => { await saveSettingsAction(fd); }} className="flex flex-col gap-4">
      <input type="hidden" name="brand" value={brand} /><input type="hidden" name="section" value="footer" />
      <input type="hidden" name="columns" value={JSON.stringify(cols)} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cols.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 rounded border border-hairline p-3">
            <input className="input text-sm font-bold" value={c.title} onChange={(e) => setCol(i, { ...c, title: e.target.value })} placeholder="Column title" aria-label="Column title" />
            {c.items.map((it, j) => (
              <div key={j} className="flex gap-1">
                <input className="input text-xs" value={it.label} onChange={(e) => setCol(i, { ...c, items: c.items.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} placeholder="Label" aria-label="Link label" />
                <input className="input text-xs" value={it.href} onChange={(e) => setCol(i, { ...c, items: c.items.map((x, k) => (k === j ? { ...x, href: e.target.value } : x)) })} placeholder="/path or https://" aria-label="Link URL" />
                <button type="button" className="btn-ghost btn-sm" aria-label="Remove link" onClick={() => setCol(i, { ...c, items: c.items.filter((_, k) => k !== j) })}>×</button>
              </div>
            ))}
            <div className="flex gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setCol(i, { ...c, items: [...c.items, { label: '', href: '' }] })}>+ Link</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setCols(cols.filter((_, k) => k !== i))}>Remove column</button></div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setCols([...cols, { title: '', items: [] }])} disabled={cols.length >= 5}>+ Column</button>
        <div className="flex flex-col"><label className="field-label" htmlFor="ft-tag">Tagline</label><input id="ft-tag" name="tagline" className="input text-sm" defaultValue={tagline} /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor="ft-legal">Legal line</label><input id="ft-legal" name="legalText" className="input text-sm" defaultValue={legalText} placeholder="Leave blank for none" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="partners" defaultChecked={partners} /> Partner logos along the bottom</label>
        <button type="submit" className="btn-gold btn-sm">Save footer</button>
      </div>
    </form>
  );
}
