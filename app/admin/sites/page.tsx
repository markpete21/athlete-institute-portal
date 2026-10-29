import Link from 'next/link';
import { getPortalSession } from '@/lib/auth';
import { brandsWithoutSite, listSites, siteOrigin } from '@/lib/site/sites';
import { editableSites } from '@/lib/site/scopes';
import { pageCounts } from '@/lib/site/pages';
import { THEMES } from '@ai/foundation';
import { createSiteAction } from './actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = { live: { label: 'Live', cls: 'pos' }, coming_soon: { label: 'Coming soon', cls: 'warn' }, off: { label: 'Off', cls: 'muted' } };

/**
 * Websites index (Module 23 §2.1): one row per brand site the signed-in user
 * may open, with status, domain, page counts and last edit. Super admins can
 * add a site for a brand that has none; everything else happens inside the
 * site.
 */
export default async function SitesIndex() {
  const session = await getPortalSession();
  const [sites, allowed, missing] = await Promise.all([listSites(), editableSites(session), brandsWithoutSite()]);
  const mine = sites.filter((s) => allowed.includes(s.brandKey));
  const counts = await Promise.all(mine.map((s) => pageCounts(s.brandKey)));
  const isSuper = session.isStaff && session.roles.includes('Admin');
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-7 py-9">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Engagement</p>
        <h1 className="text-4xl">Websites<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body max-w-[65ch] text-sm">Each brand&apos;s public website: pages, menu, stories, media, SEO and the launch switch. Compete standings, Play registration and Watch links are shared automatically.</p>
      </header>

      {mine.length === 0 && <p className="text-body text-sm">You don&apos;t have access to any site yet. Ask a site admin to add you under Members.</p>}

      <div className="flex flex-col gap-3">
        {mine.map((s, i) => {
          const c = counts[i];
          const st = STATUS[s.status];
          return (
            <Link key={s.brandKey} href={`/sites/${s.brandKey}`} className="card flex flex-wrap items-center gap-5 p-5 no-underline hover:bg-paper-panel">
              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-3"><h2 className="text-xl">{s.name}</h2><span className="mono text-xs text-silver">{s.brandKey}</span></div>
                <p className="text-body text-sm">{s.primaryHost ? siteOrigin(s) : 'No domain yet'} · {THEMES[s.themeKey]?.name ?? s.themeKey} theme</p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <span><b>{c.published}</b> published{c.changes ? <span className="text-silver"> · {c.changes} with changes</span> : null}{c.draft ? <span className="text-silver"> · {c.draft} draft</span> : null}</span>
                {c.lastEdit && <span className="text-silver">Edited {new Date(c.lastEdit.at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>}
                <span className={`pill-status ${st.cls}`}>{st.label}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {isSuper && missing.length > 0 && (
        <section className="card flex flex-col gap-4 p-5">
          <div className="card-head"><h2>Add a site</h2><span className="card-head-lbl">Super admin</span></div>
          <form action={createSiteAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col"><label className="field-label" htmlFor="ns-brand">Brand</label>
              <select id="ns-brand" name="brandKey" className="input text-sm" required>{missing.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="ns-name">Site name</label><input id="ns-name" name="name" className="input text-sm" placeholder="e.g. Vanguard Basketball" /></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="ns-theme">Theme</label>
              <select id="ns-theme" name="themeKey" className="input text-sm" defaultValue="vanguard">{Object.values(THEMES).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></div>
            <SubmitButton className="btn-gold btn-sm" pendingLabel="Creating…" doneLabel="Created">Create site (off)</SubmitButton>
          </form>
          <p className="text-body text-xs">A new site starts switched off with a home page and the standard system pages. Nothing is public until an admin flips it to Coming soon or Live.</p>
        </section>
      )}
    </main>
  );
}
