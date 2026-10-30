import Link from 'next/link';
import SignInLink from '@/components/site/SignInLink';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getSiteSession } from '@/lib/site/editor-session';
import { siteRoleFor, canManage } from '@/lib/site/scopes';
import { getSite, siteOrigin } from '@/lib/site/sites';
import { listMedia } from '@/lib/site/media';
import { SiteTabs } from './SiteTabs';

export const dynamic = 'force-dynamic';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca';
const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
const STATUS: Record<string, { label: string; cls: string }> = { live: { label: 'Live', cls: 'pos' }, coming_soon: { label: 'Coming soon', cls: 'warn' }, off: { label: 'Off', cls: 'muted' } };

/**
 * The site's own editor, served at <brand host>/admin (Module 23 §2.2, owner
 * decision Oct 30 2026: every site is edited at its own domain). Its own
 * shell, not the portal AdminShell: the site's shield and name, status, the
 * section tabs, who is signed in. The per-brand role gate lives here, so
 * every screen underneath can assume access and only hides what the role may
 * not do. Signed out: a sign-in page (Clerk on a satellite host, otherwise the
 * hand-off from the portal Admin).
 */
export default async function EditorLayout({ children, params }: { children: React.ReactNode; params: { brand: string } }) {
  const site = await getSite(params.brand);
  if (!site) notFound();
  const session = await getSiteSession(params.brand);
  const role = await siteRoleFor(session, params.brand);
  const h = headers();
  const origin = siteOrigin(site, h.get('host'));
  const media = await listMedia(site.brandKey).catch(() => []);
  const shield = media.find((m) => m.name === 'shield-on-black.png')?.url ?? `/sites/${site.brandKey}/logos/shield-on-black.png`;
  const expired = (h.get('x-portal-path') ?? '').includes('expired=1');

  if (!role) {
    const satellite = site.settings.clerk_satellite === true;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-7 py-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shield} alt={site.name} style={{ height: 72, width: 'auto', alignSelf: 'flex-start' }} />
        <h1 className="text-3xl">{site.name} editor<span style={{ color: 'var(--accent)' }}>.</span></h1>
        {session.userId ? (
          <p className="text-body text-sm">You&apos;re signed in as {session.email}, but this account doesn&apos;t have access to this site. Ask a site admin to add you under Members.</p>
        ) : expired ? (
          <p className="text-body text-sm">That link has expired. Open the editor again from Admin › Websites.</p>
        ) : (
          <p className="text-body text-sm">Sign in to edit this site.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {satellite && !session.userId && <SignInLink className="btn-gold btn-sm" fallbackHref={`${PLAY_URL}/sign-in?redirect_url=${encodeURIComponent(`${origin}/admin`)}`} redirectPath="/admin">Sign in</SignInLink>}
          <a className={satellite ? 'btn-ghost btn-sm' : 'btn-gold btn-sm'} href={`${ADMIN_URL}/sites`}>Open from Admin › Websites</a>
          <Link className="btn-ghost btn-sm" href="/">Back to the site</Link>
        </div>
        {!satellite && <p className="text-xs text-silver">Sign in at {ADMIN_URL.replace(/^https?:\/\//, '')}, open Websites and click Open editor; it signs you in here for 12 hours.</p>}
      </main>
    );
  }

  const st = STATUS[site.status];
  const tabs = [
    ['', 'Overview'], ['pages', 'Pages'], ['nav', 'Menu'], ['stories', 'Stories'], ['media', 'Media'], ['locations', 'Locations'], ['programs', 'Programs'],
    ['leads', 'Leads'], ['seo', 'SEO'], ['analytics', 'Analytics'], ...(canManage(role) ? [['members', 'Members'], ['settings', 'Settings']] : []),
  ] as [string, string][];
  const who = session.email ?? 'you';
  return (
    <div className="min-h-screen" style={{ background: 'var(--paper, #f6f5f2)' }}>
      <header className="border-b border-hairline bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-7 py-3">
          <Link href="/admin" className="flex items-center gap-3 no-underline text-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shield} alt="" style={{ height: 36, width: 'auto' }} />
            <span className="text-lg font-extrabold tracking-[-0.03em]">{site.name} <span className="font-normal text-silver">editor</span></span>
          </Link>
          <span className={`pill-status ${st.cls}`}>{st.label}</span>
          {site.settings.gate_password && <span className="pill-status warn">Password on</span>}
          <span className="ml-auto flex items-center gap-3 text-xs text-silver">
            <a href={origin} target="_blank" rel="noopener" className="text-ink">View site</a>
            <span title={role}>{who}</span>
            {session.via === 'cookie' ? <a href="/admin/signout" className="text-ink">Sign out</a> : <a href={`${ADMIN_URL}/sites`} className="text-ink">All sites</a>}
          </span>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-7 py-6">
        <SiteTabs base="/admin" tabs={tabs} />
        {children}
      </main>
    </div>
  );
}
