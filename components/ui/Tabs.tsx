'use client';

import { useState, type ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: string;
  content: ReactNode;
}

/** Underline tabs; the active tab's rule uses the brand accent. */
export function Tabs({ items, initialKey }: { items: TabItem[]; initialKey?: string }) {
  const [active, setActive] = useState(initialKey ?? items[0]?.key);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-6 border-b border-hairline" role="tablist">
        {items.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className="-mb-px border-b-2 pb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors"
              style={{
                borderColor: on ? 'var(--accent)' : 'transparent',
                color: on ? 'var(--accent)' : '#9ea1a1',
              }}
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
