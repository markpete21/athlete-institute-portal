'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Cross-app switcher — renders THE saved apps menu the hub publishes at
 * https://home.athleteinstitute.ca/api/ecosystem/apps-menu, so this portal
 * shows the exact same menu as the hub / Live / Tickets / Goals headers and
 * picks up menu changes without a deploy here.
 *
 * Fetched client-side on first open (public endpoint, CORS *); until it
 * arrives — or if it never does — a plain "All apps" link to the hub renders
 * instead, so the chrome never breaks on a hub outage.
 *
 * Self-contained styling (inline + one <style> block) because it sits in three
 * different shells (Play, Admin, Compete) with their own CSS systems.
 */

interface MenuApp {
  key: string;
  name: string;
  blurb: string;
  url: string;
  icon: string;
  group: 'apps' | 'admin';
  ground: 'dark' | 'light';
}

const MENU_URL =
  process.env.NEXT_PUBLIC_APPS_MENU_URL ||
  'https://home.athleteinstitute.ca/api/ecosystem/apps-menu';

const DOTS_DARK = 'radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)';
const DOTS_LIGHT = 'radial-gradient(rgba(30,30,30,0.1) 1px, transparent 1px)';

export default function AppsMenu({
  current,
  showAdmin = false,
  tone = 'onDark',
}: {
  /** This site's key in the menu (gets the gold current-app border). */
  current: string;
  /** Admin surfaces show the Admin group; public ones list public apps only. */
  showAdmin?: boolean;
  /** Ground behind the trigger: hover goes white on dark bars, ink on light. */
  tone?: 'onDark' | 'onLight';
}) {
  const hover = tone === 'onDark' ? '#ffffff' : '#1e1e1e';
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<MenuApp[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(MENU_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b: { apps?: MenuApp[] }) => {
        if (alive && Array.isArray(b.apps) && b.apps.length) setApps(b.apps);
      })
      .catch(() => {}); // fallback link stays
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!apps) {
    return (
      <a
        className="am-fallback"
        href="https://home.athleteinstitute.ca"
        title="All apps"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, color: '#9b9891',
        }}
      >
        <Dots />
      </a>
    );
  }

  const groups: Array<[string, MenuApp[]]> = [
    ['Apps.', apps.filter((a) => a.group === 'apps')],
    ...(showAdmin
      ? ([['Admin', apps.filter((a) => a.group === 'admin')]] as Array<[string, MenuApp[]]>)
      : []),
  ];

  return (
    <div ref={rootRef} className="am-root">
      <button
        className="am-trigger"
        aria-label="Switch app"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Dots />
      </button>

      {open && (
        <div className="am-panel" role="menu">
          {groups.map(
            ([label, list]) =>
              list.length > 0 && (
                <React.Fragment key={label}>
                  <p className="am-label">{label}</p>
                  <div className="am-grid">
                    {list.map((a) => {
                      const dark = a.ground === 'dark';
                      return (
                        <a
                          key={a.key}
                          href={a.url}
                          role="menuitem"
                          aria-current={a.key === current ? 'page' : undefined}
                          className={`am-tile${a.key === current ? ' am-current' : ''}`}
                          style={{
                            backgroundColor: dark ? '#000' : '#F5F2EA',
                            backgroundImage: dark ? DOTS_DARK : DOTS_LIGHT,
                            backgroundSize: '20px 20px',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.icon} alt={a.name} />
                        </a>
                      );
                    })}
                  </div>
                </React.Fragment>
              )
          )}
        </div>
      )}

      <style jsx>{`
        .am-root { position: relative; }
        .am-trigger {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; color: #9b9891; background: none;
          border: 0; cursor: pointer; transition: color 0.15s;
        }
        .am-trigger:hover { color: ${hover}; }
        .am-panel {
          position: absolute; right: 0; top: 44px; z-index: 60; width: 372px;
          border: 1px solid rgba(30, 30, 30, 0.14); background: #e9e9e7;
          padding: 12px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        }
        .am-label {
          margin: 0; padding: 0 4px 8px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px; font-weight: 500; letter-spacing: 0.18em;
          text-transform: uppercase; color: #6b6760;
        }
        .am-label + .am-grid + .am-label { padding-top: 12px; }
        .am-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .am-tile {
          position: relative; display: flex; aspect-ratio: 16 / 10;
          overflow: hidden; border: 1px solid rgba(30, 30, 30, 0.14);
          transition: border-color 0.15s;
        }
        .am-tile:hover { border-color: #9e8959; }
        .am-current { border-color: #9e8959; }
        .am-tile img { width: 100%; height: 100%; object-fit: cover; }
      `}</style>
    </div>
  );
}

function Dots() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {[1, 9, 17].flatMap((y) =>
        [1, 9, 17].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />
        ))
      )}
    </svg>
  );
}
