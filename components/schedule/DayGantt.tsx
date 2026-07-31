import Link from 'next/link';
import { torontoInstant } from '@ai/foundation';
import { DAY_AXIS, torontoDateOf, type GanttViewRow } from '@/lib/schedule-views';

/**
 * The operational parent/child resource view (Module 2 Stage 5): facility
 * columns left (parent, child), time across the top, bookings as bars.
 * Conflicted bars get the clash treatment and link to the conflicts queue.
 * Bars are hard-cornered data marks (house style reserves pills for
 * controls); a hairline now-marker crosses the grid when viewing today.
 */

const SOURCE_COLOR: Record<string, string> = {
  program: 'var(--accent)',
  event: '#3f7a5b',
  rental: '#5b7a9e',
  internal: '#9ea1a1',
};

const SOURCE_LABEL: Record<string, string> = {
  program: 'Program',
  event: 'Event',
  rental: 'Rental',
  internal: 'Internal',
};

/** Fraction of the day axis elapsed as of now; null when not viewing today. */
function nowFraction(dateISO: string): number | null {
  const nowIso = new Date().toISOString();
  if (torontoDateOf(nowIso) !== dateISO) return null;
  const startMs = Date.parse(torontoInstant(dateISO, `${String(DAY_AXIS.startHour).padStart(2, '0')}:00`));
  const endMs = Date.parse(torontoInstant(dateISO, `${String(DAY_AXIS.endHour).padStart(2, '0')}:00`));
  const f = (Date.now() - startMs) / (endMs - startMs);
  return f >= 0 && f <= 1 ? f : null;
}

const LANE_HEIGHT = 28;

/**
 * Greedy lane assignment: overlapping bars in one row stack into sub-lanes
 * instead of occluding each other (a keep-both double-booking must show BOTH
 * bookings). Returns each bar's lane and the row's lane count.
 */
function assignLanes(bars: GanttViewRow['bars']): { lanes: number[]; laneCount: number } {
  const order = bars
    .map((b, i) => ({ i, start: b.start, end: b.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(bars.length).fill(0);
  for (const { i, start, end } of order) {
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes[i] = lane;
  }
  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}

export function DayGantt({ rows, dateISO }: { rows: GanttViewRow[]; dateISO: string }) {
  const hours = Array.from(
    { length: DAY_AXIS.endHour - DAY_AXIS.startHour },
    (_, i) => DAY_AXIS.startHour + i,
  );
  const nowFrac = nowFraction(dateISO);

  return (
    <div className="flex flex-col gap-2">
      <div className="card overflow-x-auto">
        <div className="relative min-w-[860px]">
          {/* time header */}
          <div className="flex border-b border-hairline">
            <div className="w-28 shrink-0 border-r border-hairline px-3 py-2 label text-[10px]">Facility</div>
            <div className="w-36 shrink-0 border-r border-hairline px-3 py-2 label text-[10px]">Space</div>
            <div className="relative h-8 flex-1">
              {hours.map((h, i) => (
                <span
                  key={h}
                  className="absolute top-2 mono text-[10px] text-silver"
                  style={{ left: `${(i / hours.length) * 100}%`, paddingLeft: 3 }}
                >
                  {h}:00
                </span>
              ))}
            </div>
          </div>

          {rows.map((r, rowIdx) => {
            const { lanes, laneCount } = assignLanes(r.bars);
            const rowHeight = Math.max(44, laneCount * LANE_HEIGHT + 8);
            // Parent label prints once per contiguous group; the hairline
            // between groups stays heavier than between a group's children.
            const isNewParent = rowIdx === 0 || rows[rowIdx - 1].parent !== r.parent;
            return (
              <div
                key={`${r.facilityId}-${r.child}`}
                className={`flex border-b border-hairline last:border-0 ${isNewParent ? 'border-t border-t-hairline' : ''}`}
              >
                <div className="w-28 shrink-0 border-r border-hairline px-3 py-3 text-[12px] font-bold text-ink">
                  {isNewParent ? r.parent : ''}
                </div>
                <div className="w-36 shrink-0 border-r border-hairline px-3 py-3 label text-[10px]">
                  {r.child}
                </div>
                <div className="relative flex-1" style={{ height: rowHeight }}>
                  {/* hour gridlines */}
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="absolute bottom-0 top-0 border-l border-hairline"
                      style={{ left: `${(i / hours.length) * 100}%` }}
                    />
                  ))}
                  {/* now marker (row segment) */}
                  {nowFrac !== null && (
                    <div
                      className="absolute bottom-0 top-0 w-px"
                      style={{ left: `${nowFrac * 100}%`, backgroundColor: '#b4483c' }}
                    />
                  )}
                  {r.bars.map((b, barIdx) => {
                    const laneTop =
                      laneCount === 1
                        ? (rowHeight - 24) / 2
                        : 4 + lanes[barIdx] * LANE_HEIGHT;
                    const bar = (
                      <div
                        className="absolute flex items-center overflow-hidden whitespace-nowrap px-2 text-[10px] font-bold uppercase tracking-wide text-white"
                        style={{
                          left: `${b.start * 100}%`,
                          width: `${Math.max(0.015, b.end - b.start) * 100}%`,
                          top: laneTop,
                          height: 24,
                          backgroundColor: SOURCE_COLOR[b.source] ?? 'var(--accent)',
                          opacity: b.status === 'tentative' ? 0.55 : 1,
                          outline: b.conflicted ? '2px solid #b4483c' : undefined,
                          outlineOffset: b.conflicted ? 1 : undefined,
                          borderLeft: b.status === 'tentative' ? '3px double #ffffff' : undefined,
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
            );
          })}

          {rows.length === 0 && (
            <p className="px-4 py-6 text-sm text-silver">Nothing on the schedule for this day.</p>
          )}
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        {Object.entries(SOURCE_LABEL).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-silver">
            <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: SOURCE_COLOR[key] }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-silver">
          <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: SOURCE_COLOR.program, opacity: 0.55 }} />
          Quote hold
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-silver">
          <span className="inline-block h-2.5 w-2.5" style={{ outline: '2px solid #b4483c', outlineOffset: -1 }} />
          Conflict
        </span>
        {nowFrac !== null && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-silver">
            <span className="inline-block h-2.5 w-px" style={{ backgroundColor: '#b4483c' }} />
            Now
          </span>
        )}
      </div>
    </div>
  );
}
