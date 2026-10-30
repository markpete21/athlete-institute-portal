import Link from 'next/link';
import { listPages } from '@/lib/site/pages';
import { getSite } from '@/lib/site/sites';
import { pageIssues } from '@/lib/site/seo';
import { NewPageDialog } from './NewPageDialog';
import { PreviewButton } from '../PreviewButton';

export const dynamic = 'force-dynamic';

const STATE: Record<string, { label: string; cls: string }> = { published: { label: 'Published', cls: 'pos' }, changes: { label: 'Changes', cls: 'warn' }, draft: { label: 'Draft', cls: 'muted' } };
const fmt = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Pages list (Module 23 §2.3): every page with state, address, last edit and SEO issues; New page and Build with Claude. */
export default async function PagesList({ params, searchParams }: { params: { brand: string }; searchParams: { q?: string; state?: string } }) {
  const brand = params.brand;
  const [site, pages] = await Promise.all([getSite(brand), listPages(brand)]);
  if (!site) return null;
  const q = (searchParams.q ?? '').toLowerCase();
  const list = pages.filter((p) => (!q || p.title.toLowerCase().includes(q) || p.slug.includes(q)) && (!searchParams.state || p.state === searchParams.state));
  const groups: [string, typeof pages][] = [['Home', list.filter((p) => p.kind === 'home')], ['Locations', list.filter((p) => p.template === 'location' || p.template === 'location-sport' || p.template === 'locations')], ['Sports and programs', list.filter((p) => ['sport', 'sport-soon', 'circuit', 'training', 'programs'].includes(p.template))], ['Compete', list.filter((p) => ['scores', 'standings', 'rosters', 'my-teams'].includes(p.template))], ['Families and about', list.filter((p) => ['parent-guide', 'financial-assistance', 'about', 'privacy-policy', 'stories'].includes(p.template))], ['Custom pages', list.filter((p) => p.kind === 'custom')]];
  const seen = new Set(groups.flatMap(([, g]) => g.map((p) => p.id)));
  groups.push(['Other', list.filter((p) => !seen.has(p.id))]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex items-center gap-2"><input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search pages" className="input text-sm" aria-label="Search pages" />
          <nav className="seg">{[['', 'All'], ['published', 'Published'], ['changes', 'Changes'], ['draft', 'Drafts']].map(([k, l]) => <Link key={k} href={`/admin/pages${k ? `?state=${k}` : ''}`} className={(searchParams.state ?? '') === k ? 'on' : ''}>{l}</Link>)}</nav></form>
        <div className="flex gap-2"><PreviewButton brand={brand} label="Preview site" /><NewPageDialog brand={brand} /></div>
      </div>
      {groups.filter(([, g]) => g.length).map(([name, g]) => (
        <section key={name} className="card p-0">
          <div className="card-head p-4 pb-2"><h2>{name}</h2><span className="card-head-lbl">{g.length}</span></div>
          <table className="data-table">
            <thead><tr><th>Page</th><th>Address</th><th>State</th><th>Last edit</th><th>SEO</th></tr></thead>
            <tbody>{g.map((p) => {
              const st = STATE[p.state]; const issues = pageIssues(site, p, pages);
              return (
                <tr key={p.id} className="clickable">
                  <td><Link href={`/admin/pages/${p.id}`} className="font-bold no-underline text-ink">{p.title}</Link>{p.hiddenFromMenu && <span className="tag ml-2 text-[10px]">hidden</span>}</td>
                  <td className="mono text-xs text-silver">/{p.slug}</td>
                  <td><span className={`pill-status ${st.cls}`}>{st.label}</span></td>
                  <td className="text-xs text-silver">{fmt(p.updatedAt)}</td>
                  <td className="text-xs">{issues.length ? <Link href={`/admin/pages/${p.id}?panel=seo`} className="text-[#8a6d1f]">{issues.length} issue{issues.length === 1 ? '' : 's'}</Link> : <span className="text-silver">OK</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
