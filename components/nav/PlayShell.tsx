'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/nav/icons';
import type { BrandTile } from '@/lib/play/brands';

/**
 * The persistent public chrome (Play. Portal): a dark header carrying the
 * wordmark and brand logo tiles (hover -> name + active programs, dropdown ->
 * program tiles), a dark nav row, and a fixed bottom status bar for the three
 * account numbers. Wraps the play tree via app/play/layout.tsx.
 *
 * Zero-value status blocks are omitted entirely, and each one swaps its whole
 * face for an explainer on hover.
 */

export interface StatusItem {
  icon: string;
  value: string;
  name?: string | null;
  label?: string | null;
  tip: string;
}

export interface PlayShellProps {
  brands: BrandTile[];
  status: StatusItem[];
  signedIn: boolean;
  initials: string | null;
  children: React.ReactNode;
}

const NAV = [
  { href: '/account', label: 'My account' },
  { href: '/programs', label: 'Programs' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/points', label: 'Play Points' },
];

/** Monogram fallback for a brand with no uploaded logo yet. */
function Monogram({ name, colour }: { name: string; colour: string }) {
  const letters = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span className="ps-mono-mark" style={{ color: colour }}>{letters}</span>;
}

export default function PlayShell({ brands, status, signedIn, initials, children }: PlayShellProps) {
  const pathname = usePathname() ?? '/';
  const [openBrand, setOpenBrand] = useState<string | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-brand-root]')) setOpenBrand(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenBrand(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  // Hover opens the tile menu; a short close delay lets you travel into it.
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  const open = (k: string) => { if (closeTimer) clearTimeout(closeTimer); setOpenBrand(k); };
  const close = () => { closeTimer = setTimeout(() => setOpenBrand(null), 160); };

  return (
    <div className="play-shell">
      <header className="ps-topbar">
        <div className="ps-topbar-in">
          <Link href="/account" className="ps-brand">
            <span className="ps-play">Play</span><span className="ps-ball">.</span> <span className="ps-portal">Portal</span>
          </Link>

          <div className="ps-brands">
            {brands.map((b) => (
              <div
                key={b.key}
                className={`ps-bwrap${openBrand === b.key ? ' open' : ''}`}
                style={{ ['--bc' as string]: b.accent }}
                data-brand-root
                onMouseEnter={() => open(b.key)}
                onMouseLeave={close}
              >
                <button
                  className="ps-btile"
                  aria-label={b.name}
                  aria-expanded={openBrand === b.key}
                  onClick={() => setOpenBrand(openBrand === b.key ? null : b.key)}
                >
                  {b.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={b.logoUrl} alt="" />
                    : <Monogram name={b.name} colour={b.accent} />}
                </button>

                <span className="ps-bhover" aria-hidden>
                  <b>{b.name}</b>
                  <span>{b.programs.length} active program{b.programs.length === 1 ? '' : 's'}</span>
                </span>

                {openBrand === b.key && (
                  <div className="ps-bmenu">
                    <div className="ps-bmenu-head">
                      <span className="ps-mk">
                        {b.logoUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={b.logoUrl} alt="" />
                          : <Monogram name={b.name} colour={b.accent} />}
                      </span>
                      <span>
                        <b>{b.name}</b>
                        <span>{b.tagline ? `${b.tagline} · ` : ''}{b.programs.length} active</span>
                      </span>
                    </div>
                    {b.programs.length === 0 ? (
                      <p className="ps-empty">No programs open right now.</p>
                    ) : (
                      <div className="ps-tiles">
                        {b.programs.map((p) => (
                          <Link key={p.id} href={`/p/${p.id}`} className="ps-tile" onClick={() => setOpenBrand(null)}>
                            <b>{p.name}</b>
                            {p.scheduleLabel && <span className="ps-meta">{p.scheduleLabel}</span>}
                            <span className="ps-spots">{p.spotsLabel}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    <div className="ps-bmenu-foot">
                      <span className="ps-note">Active programs</span>
                      <Link href={`/programs?brand=${b.key}`} className="ps-linkbtn" onClick={() => setOpenBrand(null)}>
                        All {b.name} →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="ps-top-right">
            {signedIn ? (
              <Link href="/account" className="ps-me">{initials ?? 'ME'}</Link>
            ) : (
              <Link href="/sign-in" className="ps-signin">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <nav className="ps-navbar">
        <div className="ps-navbar-in">
          {NAV.map((n) => {
            const on = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link key={n.href} href={n.href} className={on ? 'on' : undefined}>{n.label}</Link>
            );
          })}
        </div>
      </nav>

      <div className="ps-main">{children}</div>

      {status.length > 0 && (
        <div className="ps-bottombar">
          <div className="ps-bottombar-in">
            {status.map((s, i) => (
              <div key={i} className="ps-acard">
                <span className="ps-aic"><Icon name={s.icon} /></span>
                <span className="ps-abody">
                  <span className="ps-av">{s.value}</span>
                  {s.name && <span className="ps-aname">{s.name}</span>}
                  {s.label && <span className="ps-alabel">{s.label}</span>}
                </span>
                <span className="ps-atip">{s.tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
