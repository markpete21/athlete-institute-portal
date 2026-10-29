import Link from 'next/link';
import { getSite, launchChecks, siteOrigin } from '@/lib/site/sites';
import { pageCounts, listPages } from '@/lib/site/pages';
import { leadCounts, listLeads } from '@/lib/site/leads';
import { listPostsAdmin } from '@/lib/site/posts';
import { topPaths } from '@/lib/site/views';
import { listMedia, needsAlt } from '@/lib/site/media';
import { unansweredQuestions } from '@/lib/site/claude';
import { seoChecklist } from '@/lib/site/seo';
import { getPortalSession } from '@/lib/auth';
import { siteRoleFor, canManage } from '@/lib/site/scopes';
import { LaunchSwitch } from './LaunchSwitch';
import { PreviewButton } from './PreviewButton';

export const dynamic = 'force-dynamic';

const fmt = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Site overview (Module 23 §2.2): launch state and checks, what needs attention, traffic, leads, recent edits. */
export default async function SiteOverview({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  const session = await getPortalSession();
  const role = (await siteRoleFor(session, brand))!;
  const site = await getSite(brand);
  if (!site) return null;
  const [checks, counts, pages, leads, recentLeads, posts, top, media, unanswered, checklist] = await Promise.all([
    launchChecks(brand), pageCounts(brand), listPages(brand), leadCounts(brand, 30), listLeads(brand, undefined, 6), listPostsAdmin(brand), topPaths(brand, 7, 6), listMedia(brand), unansweredQuestions(brand, 5), seoChecklist(site),
  ]);
  const changed = pages.filter((p) => p.state !== 'published').slice(0, 6);
  const scheduled = posts.filter((p) => p.status === 'scheduled');
  const missingAlt = media.filter(needsAlt).length;
  const seoLeft = checklist.filter((c) => !c.done).length;
  const totalLeads = Object.values(leads).reduce((a, b) => a + b, 0);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card flex flex-col gap-4 p-5 lg:col-span-2">
        <div className="card-head"><h2>Launch</h2><span className="card-head-lbl">{site.status === 'live' ? `Live since ${site.launchedAt ? new Date(site.launchedAt).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}` : 'Not live'}</span></div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {checks.map((c) => <li key={c.label} className="flex items-start gap-2"><span className={`pill-status ${c.ok ? 'pos' : 'warn'}`} style={{ minWidth: 54, textAlign: 'center' }}>{c.ok ? 'Done' : 'To do'}</span><span>{c.label}{c.detail && <span className="text-silver"> · {c.detail}</span>}</span></li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          {canManage(role) ? <LaunchSwitch brand={brand} status={site.status} ready={checks.every((c) => c.ok)} /> : <p className="text-body text-sm">A site admin flips the launch switch.</p>}
          <PreviewButton brand={brand} label="Preview the site" />
          {site.status === 'live' && <a className="btn-ghost btn-sm" href={siteOrigin(site)} target="_blank" rel="noopener">Open live site</a>}
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="card-head"><h2>Needs attention</h2></div>
        <ul className="flex flex-col gap-2 text-sm">
          <li><Link href={`/sites/${brand}/pages`}>{counts.changes} page{counts.changes === 1 ? '' : 's'} with unpublished changes</Link></li>
          <li><Link href={`/sites/${brand}/pages`}>{counts.draft} draft page{counts.draft === 1 ? '' : 's'}</Link></li>
          <li><Link href={`/sites/${brand}/media`}>{missingAlt} photo{missingAlt === 1 ? '' : 's'} missing alt text</Link></li>
          <li><Link href={`/sites/${brand}/seo`}>{seoLeft} SEO checklist item{seoLeft === 1 ? '' : 's'} left</Link></li>
          <li><Link href={`/sites/${brand}/leads`}>{leads.new ?? 0} new lead{(leads.new ?? 0) === 1 ? '' : 's'} to follow up</Link></li>
          {scheduled.length > 0 && <li><Link href={`/sites/${brand}/stories`}>{scheduled.length} scheduled stor{scheduled.length === 1 ? 'y' : 'ies'}</Link></li>}
        </ul>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="card-head"><h2>Last 7 days</h2><Link className="card-head-lbl" href={`/sites/${brand}/analytics`}>Analytics</Link></div>
        {top.length === 0 ? <p className="text-body text-sm">No visits recorded yet.</p> : (
          <table className="data-table"><tbody>{top.map((r) => <tr key={r.path}><td className="mono text-xs">{r.path}</td><td className="text-right">{r.views}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="card-head"><h2>Leads · 30 days</h2><Link className="card-head-lbl" href={`/sites/${brand}/leads`}>{totalLeads} total</Link></div>
        {recentLeads.length === 0 ? <p className="text-body text-sm">No leads yet. Interest forms and requests land here.</p> : (
          <ul className="flex flex-col gap-1.5 text-sm">{recentLeads.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.name || l.email} <span className="text-silver">· {l.kind}</span></span><span className="text-silver">{fmt(l.createdAt)}</span></li>)}</ul>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="card-head"><h2>Recent edits</h2><Link className="card-head-lbl" href={`/sites/${brand}/pages`}>Pages</Link></div>
        {changed.length === 0 ? <p className="text-body text-sm">Everything is published.</p> : (
          <ul className="flex flex-col gap-1.5 text-sm">{changed.map((p) => <li key={p.id} className="flex justify-between gap-2"><Link href={`/sites/${brand}/pages/${p.id}`}>{p.title}</Link><span className={`pill-status ${p.state === 'draft' ? 'muted' : 'warn'}`}>{p.state === 'draft' ? 'Draft' : 'Changes'}</span></li>)}</ul>
        )}
        {unanswered.length > 0 && (
          <>
            <div className="card-head mt-2"><h3>Ask {site.name.replace(/\s+Sport$/i, '')} couldn&apos;t answer</h3></div>
            <ul className="flex flex-col gap-1 text-sm text-body">{unanswered.map((q, i) => <li key={i}>“{q.question}”</li>)}</ul>
            <p className="text-xs text-silver">Add the answer to a page and Ask will use it.</p>
          </>
        )}
      </section>
    </div>
  );
}
