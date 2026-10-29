'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteTabs({ base, tabs }: { base: string; tabs: [string, string][] }) {
  const path = usePathname() ?? '';
  const rel = path.replace(/^\/admin/, '').slice(base.length).replace(/^\//, '');
  const current = rel.split('/')[0] ?? '';
  return (
    <nav className="seg flex flex-wrap" aria-label="Site sections">
      {tabs.map(([k, l]) => <Link key={k} href={k ? `${base}/${k}` : base} className={current === k ? 'on' : ''} aria-current={current === k ? 'page' : undefined}>{l}</Link>)}
    </nav>
  );
}
