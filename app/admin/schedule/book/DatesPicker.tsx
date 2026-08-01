'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

/**
 * Multi-select month calendar for the wizard's "specific dates" repeat: click
 * as many dates as needed across months, then submit them in one go.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function monthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTH_NAME = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function DatesPicker({
  open,
  onClose,
  initial,
  baseDate,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Already-picked extra dates. */
  initial: string[];
  /** The line's own date - shown as taken, not selectable. */
  baseDate: string;
  onSubmit: (dates: string[]) => void;
}) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(baseDate) ? baseDate : new Date().toISOString().slice(0, 10);
  const [year, setYear] = useState(Number(start.slice(0, 4)));
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1);
  const [sel, setSel] = useState<Set<string>>(new Set(initial));

  const nav = (n: number) => {
    const d = new Date(Date.UTC(year, month + n, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };

  const toggle = (d: string) => {
    const next = new Set(sel);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setSel(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="Pick the dates">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button type="button" className="btn-ghost btn-sm" onClick={() => nav(-1)}>←</button>
          <span className="font-bold text-ink">{MONTH_NAME(year, month)}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => nav(1)}>→</button>
        </div>

        <table className="w-full border-collapse text-center">
          <thead>
            <tr>
              {WEEKDAYS.map((w, i) => (
                <th key={i} className="pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-silver">{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGrid(year, month).map((week, wi) => (
              <tr key={wi}>
                {week.map((d, di) => {
                  if (!d) return <td key={di} />;
                  const isBase = d === baseDate;
                  const isSel = sel.has(d);
                  return (
                    <td key={di} className="p-0.5">
                      <button
                        type="button"
                        disabled={isBase}
                        onClick={() => toggle(d)}
                        className="mono h-9 w-full text-sm transition-colors"
                        style={{
                          backgroundColor: isSel ? 'var(--accent)' : isBase ? 'rgba(30,30,30,0.08)' : 'transparent',
                          color: isSel ? '#fff' : isBase ? '#9ea1a1' : undefined,
                          border: '1px solid',
                          borderColor: isSel ? 'var(--accent)' : 'rgba(30,30,30,0.10)',
                          cursor: isBase ? 'default' : 'pointer',
                        }}
                        title={isBase ? 'The booking date itself' : d}
                      >
                        {Number(d.slice(8))}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-silver">
            {sel.size} date{sel.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn-gold btn-sm"
              onClick={() => { onSubmit([...sel].sort()); onClose(); }}
            >
              Add {sel.size} date{sel.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
