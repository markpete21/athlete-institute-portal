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
  /** employee (Wagepoint) / contractor / volunteer (no pay) / null = unset. */
  employment: string | null;
  email: string | null;
  phone: string | null;
  assignments: Array<{ program: string; role: string | null }>;
  /** From Module 15 feedback — pooled across their public programs. */
  rating: { avg: number; count: number } | null;
  /** Tenure, from assignment history (preformatted start date). */
  stats: { startDate: string; totalSeasons: number; consecutiveSeasons: number } | null;
  /** Held certs w/ expiry state + required-but-missing ones (derived). */
  certs: {
    held: Array<{ name: string; expires: string | null; state: 'ok' | 'expiring' | 'expired' }>;
    outstanding: Array<{ name: string; context: string; expired: boolean }>;
  } | null;
  periods: StaffPeriodSummary[];
}

const PERIOD_LABEL: Record<StaffPeriodSummary['kind'], string> = { last: 'Last period', this: 'This period', next: 'Next period' };

function Stars({ rating }: { rating: StaffListRow['rating'] }) {
  if (!rating) return <span className="text-silver">—</span>;
  const filled = Math.round(rating.avg);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={`${rating.avg} / 5 from ${rating.count} review${rating.count === 1 ? '' : 's'} (program feedback)`}>
      <span aria-hidden style={{ color: 'var(--accent)', letterSpacing: '1px' }}>
        {'★'.repeat(filled)}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - filled)}</span>
      </span>
      <span className="mono text-xs text-silver">({rating.count})</span>
    </span>
  );
}

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
          <th className="w-[32%]"><SortHeader label="Programs & roles" active={sortKey === 'program'} dir={dir} onClick={() => toggleSort('program')} /></th>
          <th>Rating</th>
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
        {rows.length === 0 && <tr><td colSpan={7} className="text-silver">No staff match.</td></tr>}
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
        <td><Stars rating={s.rating} /></td>
        <td>
          <span className="flex flex-wrap gap-1">
            {s.hasLogin ? <span className="tag">login</span> : <span className="tag">account-less</span>}
            {s.employment && <span className="tag">{s.employment}</span>}
          </span>
        </td>
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
          <td colSpan={7} className="!bg-paper-panel">
            <div className="grid gap-6 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <p className="label text-[11px]">Staff stats</p>
                {s.stats ? (
                  <>
                    <div className="flex justify-between border-b border-hairline pb-1 text-sm"><span className="text-silver">Start date</span><span className="mono text-ink">{s.stats.startDate}</span></div>
                    <div className="flex justify-between border-b border-hairline pb-1 text-sm"><span className="text-silver">Total seasons</span><span className="mono text-ink">{s.stats.totalSeasons}</span></div>
                    <div className="flex justify-between pb-1 text-sm"><span className="text-silver">Consecutive seasons</span><span className="mono text-ink">{s.stats.consecutiveSeasons}</span></div>
                  </>
                ) : (
                  <p className="text-sm text-silver">No assignment history yet.</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="label text-[11px]">Certifications</p>
                {!s.certs || (s.certs.held.length === 0 && s.certs.outstanding.length === 0) ? (
                  <p className="text-sm text-silver">None held, none required.</p>
                ) : (
                  <>
                    {s.certs.held.map((c, i) => {
                      const color = c.state === 'expired' ? '#b4483c' : c.state === 'expiring' ? '#a08030' : '#3f7a5b';
                      return (
                        <div key={i} className="flex items-baseline justify-between gap-2 border-b border-hairline pb-1 text-sm">
                          <span className="text-ink">{c.name}</span>
                          <span className="mono whitespace-nowrap text-xs" style={{ color }}>
                            {c.state === 'expired' ? 'EXPIRED ' : ''}{c.expires ?? '✓'}
                          </span>
                        </div>
                      );
                    })}
                    {s.certs.outstanding.map((o, i) => (
                      <div key={`o-${i}`} className="flex flex-col border-b border-hairline pb-1 text-sm last:border-b-0">
                        <span style={{ color: o.expired ? '#b4483c' : '#a08030' }}>⚠ {o.name} outstanding</span>
                        <span className="text-xs text-silver">{o.context}</span>
                      </div>
                    ))}
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
