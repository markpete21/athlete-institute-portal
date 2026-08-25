'use client';

import { useState, type ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: string;
  content: ReactNode;
}

/** Segmented pill tabs; the active segment fills Ink. */
export function Tabs({ items, initialKey }: { items: TabItem[]; initialKey?: string }) {
  const [active, setActive] = useState(initialKey ?? items[0]?.key);
  return (
    <div className="flex flex-col gap-5">
      <div className="seg self-start" role="tablist">
        {items.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={on ? 'on' : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{items.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
