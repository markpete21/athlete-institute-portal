import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSite, siteOrigin } from '@/lib/site/sites';
import { listPages } from '@/lib/site/pages';
import { listLocations } from '@/lib/site/records';
import { keywordSuggestions, listRedirects, pageDescription, pageIssues, pageTitle, seoChecklist, TITLE_MAX } from '@/lib/site/seo';
import { addRedirectAction, deleteRedirectAction, markGscAction, setRedirectAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';
import { SeoWizard } from './SeoWizard';

export const dynamic = 'force-dynamic';

/**
 * SEO (ALL CAN §6.5): a plain-language checklist first, the setup wizard,
 * per-page titles and descriptions with Google-style previews, redirects, and
 * the sitemap/robots links. Every item names the fix and links to it.
 */
export default async function SeoPage({ params, searchParams }: { params: { brand: string }; searchParams: { wizard?: string } }) {
  const brand = params.brand;
  const site = await getSite(brand);
  if (!site) notFound();
  const [checklist, pages, locs, redirects, suggestions] = await Promise.all([seoChecklist(site), listPages(brand), listLocations(brand), listRedirects(brand), keywordSuggestions(site)]);
  const origin = siteOrigin(site);
  const done = checklist.filter((c) => c.done).length;
  const groups = [...new Set(checklist.map((c) => c.group))];
  const href = (action: string) => action === 'wizard' ? `/admin/seo?wizard=1#wizard` : action === 'gsc' ? '#google' : action === 'alt' ? `/admin/media` : action === 'redirects' ? '#redirects' : action === 'gbp' ? '#google' : action.startsWith('page:') ? `/admin/pages/${action.slice(5)}?panel=seo` : null;
  const showWizard = searchParams.wizard === '1' || !site.seo.setup_done;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card flex flex-col gap-4 p-5 lg:col-span-2">
        <div className="card-head"><h2>SEO checklist</h2><span className="card-head-lbl">{done} of {checklist.length} done</span></div>
        <div className="h-1.5 w-full rounded bg-paper-panel"><div className="h-1.5 rounded" style={{ width: `${(done / checklist.length) * 100}%`, background: 'var(--accent)' }} /></div>
        {groups.map((g) => (
          <div key={g}>
            <p className="label mb-1 text-[10px]">{g}</p>
            <ul className="flex flex-col gap-1 text-sm">{checklist.filter((c) => c.group === g).map((c) => {
              const h = href(c.action);
              return <li key={c.label} className="flex items-center gap-2"><span className={`pill-status ${c.done ? 'pos' : 'muted'}`} style={{ minWidth: 54, textAlign: 'center' }}>{c.done ? 'Done' : 'To do'}</span>{!c.done && h ? <Link href={h}>{c.label}</Link> : <span>{c.label}</span>}</li>;
            })}</ul>
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-3 p-5" id="google">
        <div className="card-head"><h2>Google</h2></div>
        <p className="text-body text-sm">Search Console shows how the site performs on Google. Verify the property with the DNS record Google gives you, then submit the sitemap.</p>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-center justify-between gap-2"><span>Search Console verified</span><form action={markGscAction} className="flex gap-1"><input type="hidden" name="brand" value={brand} /><input type="hidden" name="key" value="verified_at" /><input type="hidden" name="done" value={site.seo.gsc?.verified_at ? '' : 'on'} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Saved">{site.seo.gsc?.verified_at ? 'Mark not done' : 'Mark done'}</SubmitButton></form></li>
          <li className="flex items-center justify-between gap-2"><span>Sitemap submitted</span><form action={markGscAction} className="flex gap-1"><input type="hidden" name="brand" value={brand} /><input type="hidden" name="key" value="sitemap_submitted_at" /><input type="hidden" name="done" value={site.seo.gsc?.sitemap_submitted_at ? '' : 'on'} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Saved">{site.seo.gsc?.sitemap_submitted_at ? 'Mark not done' : 'Mark done'}</SubmitButton></form></li>
        </ul>
        <div className="text-xs text-silver">
          <p>Sitemap: <a href={`${origin}/sitemap.xml`} target="_blank" rel="noopener" className="mono">{origin}/sitemap.xml</a></p>
          <p>Robots: <a href={`${origin}/robots.txt`} target="_blank" rel="noopener" className="mono">{origin}/robots.txt</a></p>
          <p className="mt-1">Google results data appears under Analytics once a service account is connected.</p>
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5 lg:col-span-3" id="wizard">
        <div className="card-head"><h2>Site setup</h2><span className="card-head-lbl">{site.seo.setup_done ? 'Done · edit any time' : 'Three short steps'}</span></div>
        {showWizard ? <SeoWizard brand={brand} site={{ title: site.seo.title ?? site.name, description: site.seo.default_description ?? '', ogImage: site.seo.og_image_url ?? '', keywords: site.seo.keywords ?? [], business: site.seo.business ?? {}, formats: site.seo.title_formats ?? {}, indexTeams: site.seo.index_team_pages !== false, ai: site.seo.ai ?? { answers: true, training: false } }} locations={locs.map((l) => ({ slug: l.slug, name: l.name }))} suggestions={suggestions} siteName={site.name} /> : <Link className="btn-ghost btn-sm self-start" href={`/admin/seo?wizard=1#wizard`}>Edit site setup</Link>}
      </section>

      <section className="card flex flex-col gap-3 p-5 lg:col-span-3">
        <div className="card-head"><h2>Pages</h2><span className="card-head-lbl">Search title · description · issues</span></div>
        <table className="data-table">
          <thead><tr><th>Page</th><th>Search title</th><th>Description</th><th>Issues</th></tr></thead>
          <tbody>{pages.filter((p) => p.state !== 'draft').map((p) => {
            const issues = pageIssues(site, p, pages);
            const t = pageTitle(site, p), d = pageDescription(site, p);
            return (
              <tr key={p.id}>
                <td><Link href={`/admin/pages/${p.id}?panel=seo`}>{p.title}</Link><br /><span className="mono text-xs text-silver">/{p.slug}</span></td>
                <td className="text-xs">{t}<br /><span className={t.length > TITLE_MAX ? 'text-[#b4483c]' : 'text-silver'}>{t.length} chars</span></td>
                <td className="max-w-[28ch] text-xs">{d ? d : <span className="text-silver">None</span>}</td>
                <td className="text-xs">{issues.length === 0 ? <span className="pill-status pos">OK</span> : issues.map((i) => <div key={i.key + i.message}>{i.message}</div>)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>

      <section className="card flex flex-col gap-3 p-5 lg:col-span-3" id="redirects">
        <div className="card-head"><h2>Redirects</h2><span className="card-head-lbl">Old addresses that should land somewhere</span></div>
        <table className="data-table">
          <thead><tr><th>From</th><th>To</th><th>Why</th><th></th></tr></thead>
          <tbody>{redirects.map((r) => (
            <tr key={r.id}>
              <td className="mono text-xs">{r.fromPath}</td>
              <td><form action={setRedirectAction} className="flex gap-1"><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={r.id} /><input name="to" defaultValue={r.toPath ?? ''} placeholder="/new-page (blank = 404)" className="input mono text-xs" /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Saved">Set</SubmitButton></form></td>
              <td className="text-xs text-silver">{r.reason ?? ''}{!r.toPath && <span className="pill-status warn ml-2">No target</span>}</td>
              <td className="text-right"><form action={deleteRedirectAction}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Removed">Remove</SubmitButton></form></td>
            </tr>
          ))}</tbody>
        </table>
        <form action={addRedirectAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="brand" value={brand} />
          <div className="flex flex-col"><label className="field-label" htmlFor="rd-from">From</label><input id="rd-from" name="from" required placeholder="/old-page" className="input mono text-xs" /></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="rd-to">To</label><input id="rd-to" name="to" placeholder="/new-page" className="input mono text-xs" /></div>
          <input type="hidden" name="reason" value="manual" />
          <SubmitButton className="btn-ghost btn-sm" pendingLabel="Adding…" doneLabel="Added">Add redirect</SubmitButton>
        </form>
        <p className="text-xs text-silver">Renaming a page&apos;s address adds a redirect automatically. Redirects never chain: a redirect to another redirect is refused.</p>
      </section>
    </div>
  );
}
