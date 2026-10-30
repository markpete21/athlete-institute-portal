import { getPortalSession } from '@/lib/auth';
import { brandsWithoutSite, listSites, siteOrigin } from '@/lib/site/sites';
import { editableSites } from '@/lib/site/scopes';
import { pageCounts } from '@/lib/site/pages';
import { THEMES } from '@ai/foundation';
import { createSiteAction, openEditorAction } from './actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = { live: { label: 'Live', cls: 'pos' }, coming_soon: { label: 'Coming soon', cls: 'warn' }, off: { label: 'Off', cls: 'muted' } };

/**
 * Websites (Module 23 §2.1): the list of brand sites the signed-in person may
 * edit, each with an Open editor button into the site's own editor at its
 * domain (<site>/admin). Editing never happens here; super admins add sites.
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
        <p className="text-body max-w-[65ch] text-sm">Each brand&apos;s public website is edited at its own domain. Open editor signs you into that site&apos;s editor for 12 hours.</p>
      </header>

      {mine.length === 0 && <p className="text-body text-sm">You don&apos;t have access to any site yet. Ask a site admin to add you under Members.</p>}

      <div className="flex flex-col gap-3">
        {mine.map((s, i) => {
          const c = counts[i];
          const st = STATUS[s.status];
          return (
            <section key={s.brandKey} className="card flex flex-wrap items-center gap-5 p-5">
              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-3"><h2 className="text-xl">{s.name}</h2><span className="mono text-xs text-silver">{s.brandKey}</span><span className={`pill-status ${st.cls}`}>{st.label}</span>{s.settings.gate_password && <span className="pill-status warn">Password on</span>}</div>
                <p className="text-body text-sm">{s.primaryHost ? <a href={siteOrigin(s)} target="_blank" rel="noopener">{s.primaryHost}</a> : 'No domain yet'} · {THEMES[s.themeKey]?.name ?? s.themeKey} theme · <b>{c.published}</b> published{c.changes ? ` · ${c.changes} with changes` : ''}{c.draft ? ` · ${c.draft} draft` : ''}{c.lastEdit ? ` · edited ${new Date(c.lastEdit.at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : ''}</p>
              </div>
              <form action={openEditorAction}>
                <input type="hidden" name="brand" value={s.brandKey} />
                <SubmitButton className="btn-gold btn-sm" pendingLabel="Opening…" doneLabel="Opened">{s.primaryHost ? 'Open editor' : 'Add a domain first'}</SubmitButton>
              </form>
            </section>
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
          <p className="text-body text-xs">A new site starts switched off with a home page and the standard system pages. Its editor lives at the site&apos;s domain once one is set, so a super admin sets the domain here first — until then the site can&apos;t be opened.</p>
        </section>
      )}
    </main>
  );
}
