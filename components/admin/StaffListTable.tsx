'use client';

import Link from 'next/link';
import { useState } from 'react';
import { updateContactAction } from '@/app/admin/staff/actions';

/**
 * Staff list table with a quick-expand row per coach (Module 5, list page).
 * Contact info lives in the expand — email + cell with one-tap copy and an
 * inline admin edit — alongside last/this/next bi-weekly period sessions+pay.
 * Everything is preformatted server-side; this component only handles the
 * expand/copy interactions.
 */
export interface StaffPeriodSummary {
  label: string;          // "Jul 20 – Aug 2"
  kind: 'last' | 'this' | 'next';
  sessions: number;
  payDue: string | null;  // formatted CAD due in the window, null when none
  payPaid: string | null; // formatted CAD already settled in the window
}

export interface StaffListRow {
  id: number;
  name: string;
  /** "lastname, firstname" — the default sort key. */
  sortName: string;
  initials: string;
  photoUrl: string | null;
  status: string;
  statusColor: string;
  hasLogin: boolean;
  email: string | null;
  phone: string | null;
  assignments: Array<{ program: string; role: string | null }>;
  periods: StaffPeriodSummary[];
}

const PERIOD_LABEL: Record<StaffPeriodSummary['kind'], string> = { last: 'Last period', this: 'This period', next: 'Next period' };

function CopyButton({ value, what }: { value: string; what: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="tag cursor-pointer hover:border-ink"
      style={copied ? { color: '#3f7a5b', borderColor: '#3f7a5b' } : undefined}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={`Copy ${what}`}
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  );
}

type SortKey = 'name' | 'program';

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 uppercase ${active ? 'text-ink' : ''} hover:text-ink`} aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : undefined}>
      {label}
      <span className="mono text-[9px]" style={active ? { color: 'var(--accent)' } : { opacity: 0.4 }}>{active ? (dir === 1 ? '▲' : '▼') : '↕'}</span>
    </button>
  );
}

export function StaffListTable({ rows }: { rows: StaffListRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [dir, setDir] = useState<1 | -1>(1);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setDir(1); }
  };

  // Default = last name. Program sorts by first program NAME (never the
  // role label); unassigned staff sink to the bottom in both directions.
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'name') return dir * a.sortName.localeCompare(b.sortName);
    const pa = [...a.assignments].map((x) => x.program).sort()[0];
    const pb = [...b.assignments].map((x) => x.program).sort()[0];
    if (!pa && !pb) return a.sortName.localeCompare(b.sortName);
    if (!pa) return 1;
    if (!pb) return -1;
    return dir * pa.localeCompare(pb) || a.sortName.localeCompare(b.sortName);
  });

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th />
          <th><SortHeader label="Name" active={sortKey === 'name'} dir={dir} onClick={() => toggleSort('name')} /></th>
          <th className="w-[36%]"><SortHeader label="Programs & roles" active={sortKey === 'program'} dir={dir} onClick={() => toggleSort('program')} /></th>
          <th>Account</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => (
          <RowPair key={s.id} s={s} open={open === s.id} editing={editing === s.id}
            onToggle={() => { setOpen((v) => (v === s.id ? null : s.id)); setEditing(null); }}
            onEdit={() => setEditing((v) => (v === s.id ? null : s.id))} />
        ))}
        {rows.length === 0 && <tr><td colSpan={6} className="text-silver">No staff match.</td></tr>}
      </tbody>
    </table>
  );
}

function RowPair({ s, open, editing, onToggle, onEdit }: { s: StaffListRow; open: boolean; editing: boolean; onToggle: () => void; onEdit: () => void }) {
  return (
    <>
      <tr>
        <td className="w-16">
          <span className="block h-12 w-12 overflow-hidden rounded-full border border-hairline bg-paper-panel">
            {s.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-bold text-silver">{s.initials}</span>
            )}
          </span>
        </td>
        <td className="text-ink">{s.name}</td>
        <td>
          {s.assignments.length === 0 ? (
            <span className="text-silver">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {s.assignments.map((a, i) => (
                <span key={i} className="tag">
                  {a.role ? <span style={{ color: 'var(--accent)' }}>{a.role}</span> : null}
                  {a.role ? ' · ' : ''}{a.program}
                </span>
              ))}
            </span>
          )}
        </td>
        <td>{s.hasLogin ? <span className="tag">login</span> : <span className="tag">account-less</span>}</td>
        <td><span className="tag" style={{ color: s.statusColor, borderColor: s.statusColor }}>{s.status}</span></td>
        <td>
          <span className="flex justify-end gap-1">
            <button type="button" className="btn-ghost btn-sm" onClick={onToggle} aria-expanded={open}>{open ? 'Close ▴' : 'Quick view ▾'}</button>
            <Link href={`/staff/${s.id}`} className="btn-ghost btn-sm">Open</Link>
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="!bg-paper-panel">
            <div className="grid gap-6 p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="label text-[11px]">Contact</p>
                {editing ? (
                  <form action={updateContactAction} className="flex flex-col gap-2">
                    <input type="hidden" name="staffId" value={s.id} />
                    <div><label className="field-label" htmlFor={`em-${s.id}`}>Email</label><input id={`em-${s.id}`} name="email" type="email" defaultValue={s.email ?? ''} className="input text-sm" /></div>
                    <div><label className="field-label" htmlFor={`ph-${s.id}`}>Cell phone</label><input id={`ph-${s.id}`} name="phone" type="tel" defaultValue={s.phone ?? ''} placeholder="(519) 555-0123" className="input text-sm" /></div>
                    <div className="flex gap-2">
                      <button type="submit" className="btn-gold btn-sm">Save</button>
                      <button type="button" className="btn-ghost btn-sm" onClick={onEdit}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-12 text-silver">Email</span>
                      {s.email ? <><span className="text-ink">{s.email}</span><CopyButton value={s.email} what="email" /></> : <span className="text-silver">—</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-12 text-silver">Cell</span>
                      {s.phone ? <><span className="mono text-ink">{s.phone}</span><CopyButton value={s.phone} what="cell number" /></> : <span className="text-silver">—</span>}
                    </div>
                    <button type="button" className="label self-start text-[11px] hover:text-ink" onClick={onEdit}>Edit contact ↗</button>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="label text-[11px]">Pay periods</p>
                {s.periods.map((p) => (
                  <div key={p.kind} className="flex items-baseline gap-3 border-b border-hairline pb-1 text-sm last:border-b-0">
                    <span className="w-24 text-silver">{PERIOD_LABEL[p.kind]}</span>
                    <span className="mono text-xs text-silver">{p.label}</span>
                    <span className="ml-auto text-body">{p.sessions} session{p.sessions === 1 ? '' : 's'}</span>
                    <span className="mono text-ink">
                      {p.payDue ?? '—'}
                      {p.payPaid && <span style={{ color: '#3f7a5b' }}> (✓ {p.payPaid})</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
