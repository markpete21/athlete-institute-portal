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

/** Selection runs on 30-minute slots (2 per hour from the axis start). */
const SLOTS_PER_HOUR = 2;
const slotLabel = (slot: number) => {
  const h = DAY_AXIS.startHour + Math.floor(slot / SLOTS_PER_HOUR);
  const m = slot % SLOTS_PER_HOUR ? '30' : '00';
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};
const slotToHHMM = (slot: number) => {
  const h = DAY_AXIS.startHour + Math.floor(slot / SLOTS_PER_HOUR);
  return `${String(h).padStart(2, '0')}:${slot % SLOTS_PER_HOUR ? '30' : '00'}`;
};

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

/** Merge selected hours into contiguous [from, to) hour ranges. */
function hourRanges(hoursSel: number[]): Array<{ from: number; to: number }> {
  const sorted = [...hoursSel].sort((a, b) => a - b);
  const ranges: Array<{ from: number; to: number }> = [];
  for (const h of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.to === h) last.to = h + 1;
    else ranges.push({ from: h, to: h + 1 });
  }
  return ranges;
}

/** Same, as HH:MM strings for the wizard URL (slot units). */
function hoursToRanges(slotsSel: number[]): Array<{ start: string; end: string }> {
  return hourRanges(slotsSel).map((r) => ({ start: slotToHHMM(r.from), end: slotToHHMM(r.to) }));
}

export function DayGantt({ groups, dateISO, nowFrac, bookMode = false, bookIntent = 'book' }: { groups: GanttGroup[]; dateISO: string; nowFrac: number | null; bookMode?: boolean; bookIntent?: 'book' | 'quote' }) {
  const [hover, setHover] = useState<Hover | null>(null);
  // Booking selection: individual hour cells per facility, and/or whole facilities.
  const [cellSel, setCellSel] = useState<Set<string>>(new Set()); // `${facilityId}:${hour}`
  const [facSel, setFacSel] = useState<Set<number>>(new Set());
  // Click-and-drag selects like a spreadsheet: the anchor cell decides add vs
  // remove, and dragging paints the whole rectangle between the anchor and the
  // current cell (no gaps even on fast mouse movement).
  const [drag, setDrag] = useState<{
    mode: 'add' | 'remove';
    anchorFid: number;
    anchorHour: number;
    base: Set<string>;
  } | null>(null);
  useEffect(() => {
    if (!drag) return;
    const up = () => setDrag(null);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [drag]);

  // Visible row order (for the rectangle's vertical span).
  const visibleRowIds = groups.flatMap((g) => (g.rows.length ? g.rows.map((r) => r.facilityId) : [g.parentId]));
  const rowIndex = new Map(visibleRowIds.map((id, i) => [id, i]));

  const rectSelect = (mode: 'add' | 'remove', base: Set<string>, aFid: number, aHour: number, fid: number, hour: number) => {
    const next = new Set(base);
    const [r1, r2] = [rowIndex.get(aFid) ?? 0, rowIndex.get(fid) ?? 0].sort((x, y) => x - y);
    const [h1, h2] = [aHour, hour].sort((x, y) => x - y);
    for (let ri = r1; ri <= r2; ri += 1) {
      for (let h = h1; h <= h2; h += 1) {
        const key = `${visibleRowIds[ri]}:${h}`;
        if (mode === 'add') next.add(key);
        else next.delete(key);
      }
    }
    setCellSel(next);
  };
  const hours = Array.from(
    { length: DAY_AXIS.endHour - DAY_AXIS.startHour },
    (_, i) => DAY_AXIS.startHour + i,
  );
  const slotCount = hours.length * SLOTS_PER_HOUR;

  const toggleFacility = (facilityId: number) => {
    const next = new Set(facSel);
    if (next.has(facilityId)) next.delete(facilityId);
    else next.add(facilityId);
    setFacSel(next);
  };

  // Selected hours per facility; contiguous hours merge into ONE block.
  const hoursByFacility = (() => {
    const m = new Map<number, number[]>();
    for (const key of cellSel) {
      const [fid, h] = key.split(':').map(Number);
      m.set(fid, [...(m.get(fid) ?? []), h]);
    }
    return m;
  })();
  const mergedBlocks = [...hoursByFacility.entries()].flatMap(([fid, hs]) =>
    hoursToRanges(hs).map((r) => ({ facilityId: fid, ...r })),
  );
  // A facility with time blocks IS selected - don't also send it as a
  // times-to-be-set facility pick.
  const facOnly = [...facSel].filter((id) => !hoursByFacility.has(id));

  const bookHref = (() => {
    const p = new URLSearchParams({ date: dateISO });
    if (mergedBlocks.length) p.set('slots', mergedBlocks.map((b) => `${b.facilityId}_${b.start}_${b.end}`).join(','));
    if (facOnly.length) p.set('facilities', facOnly.join(','));
    if (bookIntent === 'quote') p.set('intent', 'quote');
    return `/schedule/book?${p.toString()}`;
  })();
  const selectionCount = mergedBlocks.length + facOnly.length;

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
                    facility (booking the Dome occupies all its courts). It
                    also lights up when every child row is engaged - selecting
                    something on Courts 1, 2 AND 3 means the full Dome. */}
                {(() => {
                  const engaged = (id: number) => facSel.has(id) || hoursByFacility.has(id);
                  const allChildren = g.rows.length > 0 && g.rows.every((r) => engaged(r.facilityId));
                  const lit = bookMode && (facSel.has(g.parentId) || allChildren);
                  return (
                    <div
                      className={`w-28 shrink-0 border-r border-hairline px-3 py-3 text-[12px] font-bold ${bookMode ? 'cursor-pointer' : ''}`}
                      style={lit ? { backgroundColor: 'var(--accent)', color: '#fff' } : undefined}
                      onClick={
                        bookMode
                          ? () => {
                              if (!facSel.has(g.parentId) && allChildren) {
                                // Lit via fully-engaged children: click clears them all.
                                setCellSel((prev) => {
                                  const next = new Set(prev);
                                  for (const k of prev) {
                                    const fid = Number(k.split(':')[0]);
                                    if (g.rows.some((r) => r.facilityId === fid)) next.delete(k);
                                  }
                                  return next;
                                });
                                setFacSel((prev) => {
                                  const next = new Set(prev);
                                  for (const r of g.rows) next.delete(r.facilityId);
                                  return next;
                                });
                              } else {
                                toggleFacility(g.parentId);
                              }
                            }
                          : undefined
                      }
                      title={
                        bookMode
                          ? allChildren && !facSel.has(g.parentId)
                            ? `Every space in ${g.parent} is selected - click to clear`
                            : `Select all of ${g.parent} (occupies every space inside it)`
                          : undefined
                      }
                    >
                      <span className={lit ? '' : 'text-ink'}>{g.parent}</span>
                    </div>
                  );
                })()}

                {/* col 2: child labels, heights mirroring the tracks. In book
                    mode a label is a facility multi-select toggle. */}
                <div className="w-36 shrink-0 border-r border-hairline">
                  {rows.map((r, i) => (
                    <div
                      key={r.facilityId}
                      className={`px-3 py-3 label text-[10px] ${i > 0 ? 'border-t border-hairline' : ''} ${bookMode ? 'cursor-pointer' : ''}`}
                      style={{
                        height: rowHeights[i],
                        // Lit when selected directly, via time blocks, or because
                        // the WHOLE parent facility is selected (it occupies
                        // every court inside it).
                        ...(bookMode && (facSel.has(r.facilityId) || hoursByFacility.has(r.facilityId))
                          ? { backgroundColor: 'var(--accent)', color: '#fff' }
                          : bookMode && facSel.has(g.parentId)
                            ? { backgroundColor: 'color-mix(in srgb, var(--accent) 55%, transparent)', color: '#fff' }
                            : {}),
                      }}
                      onClick={
                        bookMode
                          ? () => {
                              if (hoursByFacility.has(r.facilityId)) {
                                // Row has time blocks: the label click clears them.
                                setCellSel((prev) => {
                                  const next = new Set(prev);
                                  for (const k of prev) if (k.startsWith(`${r.facilityId}:`)) next.delete(k);
                                  return next;
                                });
                                setFacSel((prev) => { const n = new Set(prev); n.delete(r.facilityId); return n; });
                              } else {
                                toggleFacility(r.facilityId);
                              }
                            }
                          : undefined
                      }
                      title={
                        bookMode
                          ? hoursByFacility.has(r.facilityId)
                            ? 'Selected via time blocks - click to clear this row'
                            : facSel.has(g.parentId)
                              ? `Included in the ${g.parent} selection`
                              : 'Select this facility (set dates & times in the next step)'
                          : undefined
                      }
                    >
                      {r.child}
                    </div>
                  ))}
                </div>

                {/* time area: stacked tracks + group-spanning whole blocks */}
                <div className="relative flex-1" style={{ height: groupHeight }}>
                  {/* hour gridlines across the whole group + dotted half-hours */}
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="absolute bottom-0 top-0 border-l border-hairline"
                      style={{ left: `${(i / hours.length) * 100}%` }}
                    />
                  ))}
                  {hours.map((h, i) => (
                    <div
                      key={`half-${h}`}
                      className="absolute bottom-0 top-0 border-l border-dotted border-hairline"
                      style={{ left: `${((i + 0.5) / hours.length) * 100}%` }}
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
                        {/* book mode: contiguous selection renders as ONE block */}
                        {bookMode && hourRanges(hoursByFacility.get(r.facilityId) ?? []).map((rg) => (
                          <div
                            key={`sel-${rg.from}`}
                            className="pointer-events-none absolute bottom-0 top-0 z-20 border"
                            style={{
                              left: `${(rg.from / slotCount) * 100}%`,
                              width: `${((rg.to - rg.from) / slotCount) * 100}%`,
                              backgroundColor: 'var(--accent)',
                              opacity: 0.4,
                              borderColor: 'var(--accent)',
                            }}
                          />
                        ))}
                        {/* invisible 30-minute click/drag targets on top */}
                        {bookMode && Array.from({ length: slotCount }, (_, sl) => {
                          const selected = cellSel.has(`${r.facilityId}:${sl}`);
                          return (
                            <div
                              key={sl}
                              className="absolute bottom-0 top-0 z-30 cursor-pointer select-none"
                              style={{
                                left: `${(sl / slotCount) * 100}%`,
                                width: `${(1 / slotCount) * 100}%`,
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const mode = selected ? 'remove' : 'add';
                                const base = new Set(cellSel);
                                setDrag({ mode, anchorFid: r.facilityId, anchorHour: sl, base });
                                rectSelect(mode, base, r.facilityId, sl, r.facilityId, sl);
                              }}
                              onMouseEnter={() => {
                                if (drag) rectSelect(drag.mode, drag.base, drag.anchorFid, drag.anchorHour, r.facilityId, sl);
                              }}
                              title={`${r.child} · ${slotLabel(sl)}–${slotLabel(sl + 1)}`}
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
              {mergedBlocks.length > 0 && `${mergedBlocks.length} time block${mergedBlocks.length === 1 ? '' : 's'}`}
              {mergedBlocks.length > 0 && facOnly.length > 0 && ' · '}
              {facOnly.length > 0 && `${facOnly.length} facilit${facOnly.length === 1 ? 'y' : 'ies'} (times next step)`}
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
