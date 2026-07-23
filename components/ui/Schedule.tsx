import type { ReactNode } from 'react';

/**
 * Schedule / calendar primitives (Module 0 §8) — presentational SHELLS reused
 * by the Module 2 facility schedule and the Module 6 competition schedule.
 * They lay out the grid and time axis; the real booking/conflict data, drag,
 * and interaction land in those modules (which own the bookings API). Kept
 * dependency-free and brand-accent aware.
 */

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 → 21:00
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Week grid shell: day columns × hour rows. Children (events) are positioned by callers. */
export function WeekGridShell({ children }: { children?: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        <div className="border-b border-hairline" />
        {DAYS.map((d) => (
          <div key={d} className="border-b border-l border-hairline px-2 py-2 text-center label text-[10px]">
            {d}
          </div>
        ))}
        {HOURS.map((h) => (
          <div key={h} className="contents">
            <div className="border-b border-hairline px-2 py-3 text-right mono text-[11px] text-silver">
              {h}:00
            </div>
            {DAYS.map((d) => (
              <div key={d + h} className="h-12 border-b border-l border-hairline" />
            ))}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Day column shell: a single vertical time axis for one facility/day. */
export function DayColumnShell({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="card">
      <div className="border-b border-hairline px-3 py-2 label text-[10px]">{label}</div>
      <div className="relative">
        {HOURS.map((h) => (
          <div key={h} className="flex h-12 items-start border-b border-hairline px-3">
            <span className="mono text-[11px] text-silver">{h}:00</span>
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}

export interface GanttRow {
  label: string;
  /** 0..1 fractions of the row width. */
  bars: Array<{ start: number; end: number; label?: string }>;
}

/**
 * Gantt shell — resource rows with proportional bars (facilities/teams over a
 * span). The Module 6 team/schedule builder supplies real rows; here bars are
 * positioned by fraction so it renders standalone.
 */
export function GanttShell({ rows }: { rows: GanttRow[] }) {
  return (
    <div className="card overflow-hidden">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center border-b border-hairline last:border-0">
          <div className="w-32 shrink-0 border-r border-hairline px-3 py-3 label text-[10px]">{r.label}</div>
          <div className="relative h-10 flex-1">
            {r.bars.map((b, i) => (
              <div
                key={i}
                className="absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-full px-2 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{
                  left: `${b.start * 100}%`,
                  width: `${(b.end - b.start) * 100}%`,
                  height: 20,
                  backgroundColor: 'var(--accent)',
                }}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
