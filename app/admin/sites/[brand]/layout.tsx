import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getPortalSession } from '@/lib/auth';
import { siteRoleFor, canManage } from '@/lib/site/scopes';
import { getSite, siteOrigin } from '@/lib/site/sites';
import { SiteTabs } from './SiteTabs';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = { live: { label: 'Live', cls: 'pos' }, coming_soon: { label: 'Coming soon', cls: 'warn' }, off: { label: 'Off', cls: 'muted' } };

/**
 * One brand site's editor shell (Module 23 §2.2): the site header with status
 * and the public link, then the section tabs. The per-brand role gate lives
 * here, so every screen underneath can assume access and only needs to hide
 * what the role may not do.
 */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: { brand: string } }) {
  const session = await getPortalSession();
  const role = await siteRoleFor(session, params.brand);
  if (!role) redirect('/sites');
  const site = await getSite(params.brand);
  if (!site) notFound();
  const st = STATUS[site.status];
  const origin = siteOrigin(site, headers().get('host'));
  const tabs = [
    ['', 'Overview'], ['pages', 'Pages'], ['nav', 'Menu'], ['stories', 'Stories'], ['media', 'Media'], ['locations', 'Locations'], ['programs', 'Programs'],
    ['leads', 'Leads'], ['seo', 'SEO'], ['analytics', 'Analytics'], ...(canManage(role) ? [['members', 'Members'], ['settings', 'Settings']] : []),
  ] as [string, string][];
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-7 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-4">
        <div className="flex flex-col gap-1">
          <p className="label text-[11px]"><Link href="/sites" className="no-underline">Websites</Link> · {role}</p>
          <div className="flex items-baseline gap-3"><h1 className="text-3xl">{site.name}<span style={{ color: 'var(--accent)' }}>.</span></h1><span className={`pill-status ${st.cls}`}>{st.label}</span></div>
          <p className="text-body text-sm">{site.primaryHost ? <a href={origin} target="_blank" rel="noopener" className="text-ink">{site.primaryHost}</a> : 'No domain yet'}{site.status !== 'live' && site.primaryHost ? ' · visitors see the coming-soon page' : ''}</p>
        </div>
      </header>
      <SiteTabs base={`/sites/${params.brand}`} tabs={tabs} />
      {children}
    </main>
  );
}
