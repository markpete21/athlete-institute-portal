import Link from 'next/link';
import { ECOSYSTEM_LINKS } from '@ai/foundation';

export interface NavTab {
  label: string;
  href: string;
  active?: boolean;
}

/**
 * Top navigation shell (Module 0 §8) — the consistent chrome every module
 * renders inside: brand wordmark, the portal's featured tabs, and the cross-app
 * links (Live, Tickets, Apps hub; Leagues joins when Module 7 ships). Mobile-
 * first: tabs scroll horizontally, cross-app links collapse on narrow screens.
 */
export function TopNav({
  brandName = 'Athlete Institute',
  tabs = [],
  right,
}: {
  brandName?: string;
  tabs?: NavTab[];
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-extrabold tracking-tight text-ink">
          {brandName}
          <span style={{ color: 'var(--accent)' }}>.</span>
        </Link>

        <nav className="flex flex-1 items-center gap-5 overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors"
              style={{ color: t.active ? 'var(--accent)' : '#9ea1a1' }}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden items-center gap-3 sm:flex">
            <a href={ECOSYSTEM_LINKS.live} className="label text-[10px] hover:text-ink">Live</a>
            <a href={ECOSYSTEM_LINKS.tickets} className="label text-[10px] hover:text-ink">Tickets</a>
            <a href={ECOSYSTEM_LINKS.hub} className="label text-[10px] hover:text-ink">Apps</a>
          </div>
          {right}
        </div>
      </div>
    </header>
  );
}
