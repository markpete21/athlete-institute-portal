'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DAY_AXIS, type GanttBar, type GanttGroup } from '@/lib/schedule-views';

/**
 * The operational parent/child resource view (Module 2 Stage 5): facility
 * columns left (parent, child), time across the top, bookings as bars.
 *
 * - A booking on the PARENT node renders as one block spanning every child
 *   row (booking the Dome occupies all three courts) - no "(whole)" line.
 * - Overlapping bars in a row stack into greedy sub-lanes (keep-both pairs
 *   must show both bookings).
 * - Hovering a bar shows a fixed-position hover card (immune to the
 *   horizontal scroll container's clipping).
 * - Conflicted bars link to the conflicts queue; a hairline now-marker
 *   crosses the grid when viewing today.
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

/** 12-hour axis label: 7 -> 7 AM, 12 -> 12 PM, 13 -> 1 PM. */
const fmtHour = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;

const LANE_HEIGHT = 28;
const MIN_ROW = 44;
const BAR_H = 24;

/** Greedy lane assignment so overlapping bars stack instead of occluding. */
function assignLanes(bars: GanttBar[]): { lanes: number[]; laneCount: number } {
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

interface Hover {
  bar: GanttBar;
  x: number;
  y: number;
}

function HoverCard({ hover }: { hover: Hover }) {
  const { bar, x, y } = hover;
  // Clamp so the card never leaves the viewport on the right.
  const left = Math.min(x, typeof window === 'undefined' ? x : window.innerWidth - 290);
  return (
    <div
      className="pointer-events-none fixed z-50 w-72 border border-hairline bg-paper p-4 shadow-none"
      style={{ left, top: y, borderTop: `3px solid ${SOURCE_COLOR[bar.source] ?? 'var(--accent)'}` }}
    >
      <p className="text-sm font-bold text-ink">{bar.title}</p>
      <p className="mono mt-1 text-xs text-body">{bar.timeLabel}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-silver">{bar.facilityName}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="tag">{SOURCE_LABEL[bar.source] ?? bar.source}</span>
        <span className="tag">{bar.isInternal ? 'internal' : 'external'}</span>
        <span className="tag" style={bar.status === 'tentative' ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
          {bar.status === 'tentative' ? 'quote hold' : 'confirmed'}
        </span>
      </div>
      {(bar.setupMinutes > 0 || bar.cleanupMinutes > 0) && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-silver">
          Buffers: {bar.setupMinutes}m setup · {bar.cleanupMinutes}m cleanup
        </p>
      )}
      {bar.conflicted && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#b4483c' }}>
          ⚠ In conflict — click to resolve
        </p>
      )}
    </div>
  );
}

/** Merge a facility's selected hours into contiguous HH:MM ranges. */
function hoursToRanges(hoursSel: number[]): Array<{ start: string; end: string }> {
  const sorted = [...hoursSel].sort((a, b) => a - b);
  const ranges: Array<{ from: number; to: number }> = [];
  for (const h of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.to === h) last.to = h + 1;
    else ranges.push({ from: h, to: h + 1 });
  }
  const hh = (n: number) => `${String(n).padStart(2, '0')}:00`;
  return ranges.map((r) => ({ start: hh(r.from), end: hh(r.to) }));
}

export function DayGantt({ groups, dateISO, nowFrac, bookMode = false, bookIntent = 'book' }: { groups: GanttGroup[]; dateISO: string; nowFrac: number | null; bookMode?: boolean; bookIntent?: 'book' | 'quote' }) {
  const [hover, setHover] = useState<Hover | null>(null);
  // Booking selection: individual hour cells per facility, and/or whole facilities.
  const [cellSel, setCellSel] = useState<Set<string>>(new Set()); // `${facilityId}:${hour}`
  const [facSel, setFacSel] = useState<Set<number>>(new Set());
  // Click-and-drag paints cells: the first cell decides add vs remove.
  const [dragMode, setDragMode] = useState<'add' | 'remove' | null>(null);
  useEffect(() => {
    if (!dragMode) return;
    const up = () => setDragMode(null);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragMode]);

  const paintCell = (facilityId: number, hour: number, mode: 'add' | 'remove') => {
    const key = `${facilityId}:${hour}`;
    setCellSel((prev) => {
      const next = new Set(prev);
      if (mode === 'add') next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const hours = Array.from(
    { length: DAY_AXIS.endHour - DAY_AXIS.startHour },
    (_, i) => DAY_AXIS.startHour + i,
  );

  const toggleFacility = (facilityId: number) => {
    const next = new Set(facSel);
    if (next.has(facilityId)) next.delete(facilityId);
    else next.add(facilityId);
    setFacSel(next);
  };

  const bookHref = (() => {
    const byFacility = new Map<number, number[]>();
    for (const key of cellSel) {
      const [fid, h] = key.split(':').map(Number);
      byFacility.set(fid, [...(byFacility.get(fid) ?? []), h]);
    }
    const slots: string[] = [];
    for (const [fid, hs] of byFacility) {
      for (const r of hoursToRanges(hs)) slots.push(`${fid}_${r.start}_${r.end}`);
    }
    const p = new URLSearchParams({ date: dateISO });
    if (slots.length) p.set('slots', slots.join(','));
    if (facSel.size) p.set('facilities', [...facSel].join(','));
    if (bookIntent === 'quote') p.set('intent', 'quote');
    return `/schedule/book?${p.toString()}`;
  })();
  const selectionCount = cellSel.size + facSel.size;

  const enter = (bar: GanttBar) => (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHover({ bar, x: r.left, y: r.bottom + 6 });
  };
  const leave = () => setHover(null);

  const barStyle = (b: GanttBar): React.CSSProperties => ({
    left: `${b.start * 100}%`,
    width: `${Math.max(0.015, b.end - b.start) * 100}%`,
    // Internal bookings read as internal even when they were created through
    // the rental machinery (the wizard's $0 path sets source='rental').
    backgroundColor: b.isInternal ? SOURCE_COLOR.internal : SOURCE_COLOR[b.source] ?? 'var(--accent)',
    opacity: b.status === 'tentative' ? 0.55 : 1,
    outline: b.conflicted ? '2px solid #b4483c' : undefined,
    outlineOffset: b.conflicted ? 1 : undefined,
    borderLeft: b.status === 'tentative' ? '3px double #ffffff' : undefined,
  });

  const barInner = (b: GanttBar) => (
    <>
      {b.conflicted ? '⚠ ' : ''}
      {b.title}
    </>
  );

  const nonEmpty = groups.filter((g) => g.rows.length > 0 || g.wholeBars.length > 0);

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
                  {fmtHour(h)}
                </span>
              ))}
            </div>
          </div>

          {nonEmpty.map((g) => {
            // A childless parent (OCS, or a leaf location) renders its whole
            // bars as a single ordinary row.
            const rows =
              g.rows.length > 0
                ? g.rows
                : [{ facilityId: g.parentId, child: '—', bars: g.wholeBars }];
            const spanBars = g.rows.length > 0 ? g.wholeBars : [];

            const laneInfo = rows.map((r) => assignLanes(r.bars));
            const rowHeights = laneInfo.map(({ laneCount }) =>
              Math.max(MIN_ROW, laneCount * LANE_HEIGHT + 8),
            );
            const groupHeight = rowHeights.reduce((a, b) => a + b, 0);

            return (
              <div key={g.parentId} className="flex border-b border-hairline last:border-0">
                {/* col 1: parent. In book mode, clicking selects the WHOLE
                    facility (booking the Dome occupies all its courts). */}
                <div
                  className={`w-28 shrink-0 border-r border-hairline px-3 py-3 text-[12px] font-bold ${bookMode ? 'cursor-pointer' : ''}`}
                  style={bookMode && facSel.has(g.parentId) ? { backgroundColor: 'var(--accent)', color: '#fff' } : undefined}
                  onClick={bookMode ? () => toggleFacility(g.parentId) : undefined}
                  title={bookMode ? `Select all of ${g.parent} (occupies every space inside it)` : undefined}
                >
                  <span className={bookMode && facSel.has(g.parentId) ? '' : 'text-ink'}>{g.parent}</span>
                </div>

                {/* col 2: child labels, heights mirroring the tracks. In book
                    mode a label is a facility multi-select toggle. */}
                <div className="w-36 shrink-0 border-r border-hairline">
                  {rows.map((r, i) => (
                    <div
                      key={r.facilityId}
                      className={`px-3 py-3 label text-[10px] ${i > 0 ? 'border-t border-hairline' : ''} ${bookMode ? 'cursor-pointer' : ''}`}
                      style={{
                        height: rowHeights[i],
                        ...(bookMode && facSel.has(r.facilityId)
                          ? { backgroundColor: 'var(--accent)', color: '#fff' }
                          : {}),
                      }}
                      onClick={bookMode ? () => toggleFacility(r.facilityId) : undefined}
                      title={bookMode ? 'Select this facility (set dates & times in the next step)' : undefined}
                    >
                      {r.child}
                    </div>
                  ))}
                </div>

                {/* time area: stacked tracks + group-spanning whole blocks */}
                <div className="relative flex-1" style={{ height: groupHeight }}>
                  {/* hour gridlines across the whole group */}
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="absolute bottom-0 top-0 border-l border-hairline"
                      style={{ left: `${(i / hours.length) * 100}%` }}
                    />
                  ))}
                  {nowFrac !== null && (
                    <div
                      className="absolute bottom-0 top-0 z-10 w-px"
                      style={{ left: `${nowFrac * 100}%`, backgroundColor: '#b4483c' }}
                    />
                  )}

                  {rows.map((r, ri) => {
                    const { lanes, laneCount } = laneInfo[ri];
                    const top = rowHeights.slice(0, ri).reduce((a, b) => a + b, 0);
                    return (
                      <div
                        key={r.facilityId}
                        className={`absolute inset-x-0 ${ri > 0 ? 'border-t border-hairline' : ''}`}
                        style={{ top, height: rowHeights[ri] }}
                      >
                        {/* book mode: clickable hour cells under the bars */}
                        {bookMode && hours.map((h, hi) => {
                          const selected = cellSel.has(`${r.facilityId}:${h}`);
                          return (
                            <div
                              key={h}
                              className="absolute bottom-0 top-0 z-30 cursor-pointer select-none"
                              style={{
                                left: `${(hi / hours.length) * 100}%`,
                                width: `${(1 / hours.length) * 100}%`,
                                backgroundColor: selected ? 'var(--accent)' : 'transparent',
                                opacity: selected ? 0.45 : 1,
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const mode = selected ? 'remove' : 'add';
                                setDragMode(mode);
                                paintCell(r.facilityId, h, mode);
                              }}
                              onMouseEnter={() => {
                                if (dragMode) paintCell(r.facilityId, h, dragMode);
                              }}
                              title={`${r.child} · ${fmtHour(h)}–${fmtHour(h + 1)}`}
                            />
                          );
                        })}
                        {r.bars.map((b, bi) => {
                          const laneTop =
                            laneCount === 1 ? (rowHeights[ri] - BAR_H) / 2 : 4 + lanes[bi] * LANE_HEIGHT;
                          const bar = (
                            <div
                              className="absolute flex cursor-default items-center overflow-hidden whitespace-nowrap px-2 text-[10px] font-bold uppercase tracking-wide text-white"
                              style={{ ...barStyle(b), top: laneTop, height: BAR_H }}
                              onMouseEnter={enter(b)}
                              onMouseLeave={leave}
                            >
                              {barInner(b)}
                            </div>
                          );
                          return b.conflicted ? (
                            <Link key={b.bookingId} href="/conflicts">{bar}</Link>
                          ) : (
                            <span key={b.bookingId}>{bar}</span>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* bookings on the parent: ONE block overlapping every child row */}
                  {spanBars.map((b) => {
                    const bar = (
                      <div
                        className="absolute z-20 flex cursor-default items-center justify-center overflow-hidden whitespace-nowrap border-2 border-paper px-2 text-[11px] font-bold uppercase tracking-wide text-white"
                        style={{
                          ...barStyle(b),
                          top: 3,
                          height: groupHeight - 6,
                          opacity: b.status === 'tentative' ? 0.55 : 0.92,
                        }}
                        onMouseEnter={enter(b)}
                        onMouseLeave={leave}
                      >
                        {barInner(b)}
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

          {nonEmpty.length === 0 && (
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

      {hover && !bookMode && <HoverCard hover={hover} />}
      <span className="sr-only">{dateISO}</span>

      {/* booking selection bar */}
      {bookMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper px-6 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-silver">
              {cellSel.size > 0 && `${cellSel.size} time block${cellSel.size === 1 ? '' : 's'}`}
              {cellSel.size > 0 && facSel.size > 0 && ' · '}
              {facSel.size > 0 && `${facSel.size} facilit${facSel.size === 1 ? 'y' : 'ies'} (times next step)`}
              {selectionCount === 0 && 'Click time blocks on the grid, or facility names on the left'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {selectionCount > 0 && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => { setCellSel(new Set()); setFacSel(new Set()); }}>
                  Clear
                </button>
              )}
              <Link
                href={bookHref}
                className="btn-gold btn-sm"
                aria-disabled={selectionCount === 0}
                style={selectionCount === 0 ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
              >
                Continue →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
