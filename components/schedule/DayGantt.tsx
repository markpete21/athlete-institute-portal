import Link from 'next/link';
import { DAY_AXIS, type GanttViewRow } from '@/lib/schedule-views';

/**
 * The operational parent/child resource view (Module 2 Stage 5): facility
 * columns left (parent, child), time across the top, bookings as bars.
 * Conflicted bars get the clash treatment and link to the conflicts queue.
 */

const SOURCE_COLOR: Record<string, string> = {
  program: 'var(--accent)',
  event: '#3f7a5b',
  rental: '#5b7a9e',
  internal: '#9ea1a1',
};

export function DayGantt({ rows }: { rows: GanttViewRow[] }) {
  const hours = Array.from(
    { length: DAY_AXIS.endHour - DAY_AXIS.startHour },
    (_, i) => DAY_AXIS.startHour + i,
  );

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[860px]">
        {/* time header */}
        <div className="flex border-b border-hairline">
          <div className="w-28 shrink-0 border-r border-hairline px-3 py-2 label text-[10px]">Facility</div>
          <div className="w-36 shrink-0 border-r border-hairline px-3 py-2 label text-[10px]">Space</div>
          <div className="relative h-8 flex-1">
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute top-2 mono text-[10px] text-silver"
                style={{ left: `${(i / hours.length) * 100}%` }}
              >
                {h}:00
              </span>
            ))}
          </div>
        </div>

        {rows.map((r) => (
          <div key={`${r.facilityId}-${r.child}`} className="flex border-b border-hairline last:border-0">
            <div className="w-28 shrink-0 border-r border-hairline px-3 py-3 text-[12px] font-bold text-ink">
              {r.parent}
            </div>
            <div className="w-36 shrink-0 border-r border-hairline px-3 py-3 label text-[10px]">
              {r.child}
            </div>
            <div className="relative h-11 flex-1">
              {/* hour gridlines */}
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute bottom-0 top-0 border-l border-hairline"
                  style={{ left: `${(i / hours.length) * 100}%` }}
                />
              ))}
              {r.bars.map((b) => {
                const bar = (
                  <div
                    className="absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-full px-2 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{
                      left: `${b.start * 100}%`,
                      width: `${Math.max(0.015, b.end - b.start) * 100}%`,
                      height: 22,
                      backgroundColor: SOURCE_COLOR[b.source] ?? 'var(--accent)',
                      opacity: b.status === 'tentative' ? 0.55 : 1,
                      outline: b.conflicted ? '2px solid #b4483c' : undefined,
                      outlineOffset: b.conflicted ? 1 : undefined,
                    }}
                    title={`${b.title}${b.status === 'tentative' ? ' (quote hold)' : ''}${b.conflicted ? ' - CONFLICT' : ''}`}
                  >
                    {b.conflicted ? '⚠ ' : ''}{b.title}
                  </div>
                );
                return b.conflicted ? (
                  <Link key={b.bookingId} href="/conflicts">{bar}</Link>
                ) : (
                  <span key={b.bookingId}>{bar}</span>
                );
              })}
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-silver">No facilities selected.</p>
        )}
      </div>
    </div>
  );
}
