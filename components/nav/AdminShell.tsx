'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import PlayWordmark from '@/components/brand/PlayWordmark';
import AppsMenu from '@/components/nav/AppsMenu';
import { Icon } from '@/components/nav/icons';
import {
  GROUP_ORDER, MAX_FAVOURITES, MODULES, MODULE_BY_KEY, activeModuleFor,
  type ModuleKey,
} from '@/lib/nav/modules';
import type { ProgramStat } from '@/lib/nav/prefs';

/**
 * The persistent admin chrome (Play. Admin): a dark left rail listing every
 * module grouped by area (collapsible to icons), a favourites bar of pinned
 * modules with quick-action dropdowns, and the key-stats band for pinned
 * programs. Wraps every admin screen via app/admin/layout.tsx.
 */
export interface AdminShellProps {
  email: string | null;
  roleLabel: string;
  favourites: ModuleKey[];
  railMinimized: boolean;
  pinnedStats: ProgramStat[];
  statsDays: number;
  pinnablePrograms: Array<{ id: number; name: string }>;
  pinnedProgramIds: number[];
  onToggleFavourite: (key: ModuleKey) => Promise<void>;
  onTogglePinnedProgram: (programId: number) => Promise<void>;
  onSetRailMinimized: (minimized: boolean) => Promise<void>;
  children: React.ReactNode;
}

const fmtMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function AdminShell(props: AdminShellProps) {
  const pathname = usePathname() ?? '/';
  const active = activeModuleFor(pathname);
  const [minimized, setMinimized] = useState(props.railMinimized);
  const [openMenu, setOpenMenu] = useState<ModuleKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [, startTransition] = useTransition();
  const shellRef = useRef<HTMLDivElement>(null);

  // Close any dropdown on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-menu-root]')) {
        setOpenMenu(null); setAddOpen(false); setPinOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenMenu(null); setAddOpen(false); setPinOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const toggleRail = () => {
    const next = !minimized;
    setMinimized(next);
    startTransition(() => { void props.onSetRailMinimized(next); });
  };
  const favs = props.favourites.map((k) => MODULE_BY_KEY[k]).filter(Boolean);
  const unpinned = MODULES.filter((m) => !props.favourites.includes(m.key));

  return (
    <div ref={shellRef} className={`admin-shell${minimized ? ' railmin' : ''}`}>
      {/* ---------------- left rail ---------------- */}
      <aside className="ash-rail">
        <div className="ash-brand">
          <div className="ash-brand-row">
            <Link href="/" className="ash-brand-txt">
              <span className="ash-org">Athlete Institute</span>
              <PlayWordmark variant="admin" size={26} className="ash-word" />
            </Link>
            <button className="ash-rail-toggle" onClick={toggleRail} title={minimized ? 'Expand menu' : 'Collapse menu'} aria-label={minimized ? 'Expand menu' : 'Collapse menu'}>
              <span className="ash-chev2"><Icon name="collapse" size={16} /></span>
            </button>
          </div>
        </div>

        <nav className="ash-nav">
          {GROUP_ORDER.map((group) => (
            <div key={group} className="ash-group">
              <p className="ash-group-head">{group}</p>
              <div>
                {MODULES.filter((m) => m.group === group).map((m) => (
                  <div key={m.key} className={`ash-item${active === m.key ? ' active' : ''}`} data-label={m.label}>
                    <Link href={m.href} className="ash-item-link">
                      <span className="ash-ic"><Icon name={m.key} /></span>
                      <span className="ash-item-label">{m.label}</span>
                    </Link>
                    <button
                      className={`ash-pin${props.favourites.includes(m.key) ? ' pinned' : ''}`}
                      title={props.favourites.includes(m.key) ? 'Unpin from favourites' : 'Pin to favourites'}
                      onClick={() => startTransition(() => { void props.onToggleFavourite(m.key); })}
                    >
                      <Icon name="pin" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ---------------- main column ---------------- */}
      <div className="ash-main">
        <header className="ash-topbar">
          <div className="ash-favs">
            {favs.map((m) => (
              <div key={m.key} className="ash-fav-wrap" data-menu-root>
                <button
                  className={`ash-fav${openMenu === m.key ? ' open' : ''}${active === m.key ? ' current' : ''}`}
                  onClick={() => (editing ? startTransition(() => { void props.onToggleFavourite(m.key); }) : setOpenMenu(openMenu === m.key ? null : m.key))}
                >
                  <span className="ash-fic"><Icon name={m.key} size={17} /></span>
                  <span className="ash-fav-label">{m.label}</span>
                  <span className="ash-caret"><Icon name="chev" size={13} /></span>
                  {editing && <span className="ash-rm" aria-hidden>×</span>}
                </button>
                {openMenu === m.key && (
                  <div className="ash-menu">
                    <div className="ash-menu-head"><span className="ash-fic"><Icon name={m.key} size={16} /></span><b>{m.label}</b></div>
                    {m.actions.map((a) => (
                      <Link key={a.href} href={a.href} className="ash-mi" onClick={() => setOpenMenu(null)}>
                        <span className="ash-mic"><Icon name="list" size={15} /></span>{a.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {props.favourites.length < MAX_FAVOURITES && (
              <div className="ash-fav-wrap" data-menu-root>
                <button className="ash-fav-add" onClick={() => setAddOpen(!addOpen)} title="Pin a module">
                  <Icon name="plus" size={16} />
                </button>
                {addOpen && (
                  <div className="ash-menu">
                    <div className="ash-menu-head"><span className="ash-fic"><Icon name="plus" size={16} /></span><b>Pin a module</b></div>
                    <div className="ash-menu-scroll">
                      {unpinned.map((m) => (
                        <button key={m.key} className="ash-mi" onClick={() => { setAddOpen(false); startTransition(() => { void props.onToggleFavourite(m.key); }); }}>
                          <span className="ash-mic"><Icon name={m.key} size={15} /></span>{m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {favs.length > 0 && (
              <button className="ash-fav-edit" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
            )}
          </div>

          <div className="ash-top-right">
            {/* THE shared apps menu (hub manifest) — staff surface, so the
                Admin group shows too. Light topbar → ink hover. */}
            <AppsMenu current="play-admin" showAdmin tone="onLight" />
            <div className="ash-userchip">
              <UserButton />
              <span className="ash-who"><b>{props.email ?? 'Staff'}</b><span className="ash-role">{props.roleLabel}</span></span>
            </div>
          </div>
        </header>

        {/* key stats for pinned programs (last N days) */}
        <div className="ash-infobar">
          {props.pinnedStats.map((s) => (
            <div key={s.programId} className="ash-pcard">
              <div className="ash-ptop">
                <span className="ash-pnm">{s.name}</span>
                {s.location && <span className="ash-ploc">{s.location}</span>}
              </div>
              <div className="ash-metrics">
                <span className="ash-metric">
                  <span className="ash-mrow"><b>{s.registrations}</b>{delta(s.regDeltaPct)}</span>
                  <span className="ash-mlbl">Registrations · {props.statsDays}d</span>
                </span>
                <span className="ash-metric">
                  <span className="ash-mrow"><b>{fmtMoney(s.revenueCents)}</b>{delta(s.revDeltaPct)}</span>
                  <span className="ash-mlbl">Revenue · {props.statsDays}d</span>
                </span>
              </div>
              <button className="ash-unpin" title="Unpin program" onClick={() => startTransition(() => { void props.onTogglePinnedProgram(s.programId); })}>×</button>
            </div>
          ))}

          {props.pinnedStats.length < 3 && (
            <div className="ash-fav-wrap" data-menu-root>
              <button className="ash-pinprog" onClick={() => setPinOpen(!pinOpen)}>
                <Icon name="plus" size={16} /><span>Pin program</span>
              </button>
              {pinOpen && (
                <div className="ash-menu">
                  <div className="ash-menu-head"><span className="ash-fic"><Icon name="programs" size={16} /></span><b>Pin a program</b></div>
                  <div className="ash-menu-scroll">
                    {props.pinnablePrograms.length === 0 && <p className="ash-empty">No programs yet.</p>}
                    {props.pinnablePrograms.filter((p) => !props.pinnedProgramIds.includes(p.id)).map((p) => (
                      <button key={p.id} className="ash-mi" onClick={() => { setPinOpen(false); startTransition(() => { void props.onTogglePinnedProgram(p.id); }); }}>
                        <span className="ash-mic"><Icon name="programs" size={15} /></span>{p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <main className="ash-content">{props.children}</main>
      </div>
    </div>
  );
}

function delta(pct: number | null) {
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  return <span className={`ash-delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}
