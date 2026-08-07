'use client';

import { useState, type ReactNode } from 'react';

/**
 * The division page's tab row — each tab is its own page (Mark's call,
 * reversing the earlier one-page scroll). Panes arrive server-rendered and
 * stay mounted; switching only toggles visibility, so tab flips are instant
 * and cost no refetch. No tab state in the URL on purpose: shared links land
 * on Schedule & Results, which is the page's front door.
 */
export default function DivisionTabs({
  tabs,
}: {
  tabs: { id: string; label: string; pane: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <>
      <nav className="cs-tabs" role="tablist" aria-label="Division sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            className={active === t.id ? 'cs-tab on' : 'cs-tab'}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id}>
          {t.pane}
        </div>
      ))}
    </>
  );
}
