'use client';

import { useRef } from 'react';
import Crest from './crest';

export interface TickerCell {
  kind: 'date' | 'game';
  key: string;
  /** date cells */
  dayLabel?: string; // "SAT" / "AUG 8"
  dateLabel?: string;
  /** game cells */
  href?: string;
  homeTeam?: string;
  awayTeam?: string;
  timeLabel?: string;
  divisionLabel?: string;
  live?: boolean;
}

/**
 * The scrolling rail of the upcoming-games ticker: arrow paging plus
 * click-and-drag, with drags suppressing the accidental link click
 * underneath. Content arrives pre-formatted from the server component —
 * this file owns only the scrolling.
 */
export default function TickerRail({ cells }: { cells: TickerCell[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: 0 });

  const page = (dir: 1 | -1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: dir * Math.max(260, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className="cs-tick" aria-label="Upcoming games — next 7 days">
      <button className="cs-tick-arrow" type="button" aria-label="Earlier" onClick={() => page(-1)}>‹</button>
      <div
        className="cs-tick-rail"
        ref={rail}
        onPointerDown={(e) => {
          const el = rail.current!;
          drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: 0 };
          el.classList.add('dragging');
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current.down) return;
          const dx = e.clientX - drag.current.startX;
          drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
          rail.current!.scrollLeft = drag.current.startLeft - dx;
        }}
        onPointerUp={() => { drag.current.down = false; rail.current?.classList.remove('dragging'); }}
        onPointerCancel={() => { drag.current.down = false; rail.current?.classList.remove('dragging'); }}
        onClickCapture={(e) => {
          if (drag.current.moved > 6) { e.preventDefault(); e.stopPropagation(); }
        }}
      >
        {cells.map((c) =>
          c.kind === 'date' ? (
            <div key={c.key} className="cs-tick-date">
              <span>{c.dayLabel}</span>
              <b>{c.dateLabel}</b>
            </div>
          ) : (
            <a key={c.key} className="cs-tick-game" href={c.href}>
              <span className="cs-tick-teams">
                <span className="cs-tick-row"><Crest name={c.homeTeam!} small /><b>{c.homeTeam}</b></span>
                <span className="cs-tick-row"><Crest name={c.awayTeam!} small /><b>{c.awayTeam}</b></span>
              </span>
              <span className={c.live ? 'cs-tick-time live' : 'cs-tick-time'}>{c.timeLabel}</span>
              <span className="cs-tick-div label">{c.divisionLabel}</span>
            </a>
          ),
        )}
      </div>
      <button className="cs-tick-arrow" type="button" aria-label="Later" onClick={() => page(1)}>›</button>
    </div>
  );
}
