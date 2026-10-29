import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSite } from '@/lib/site/sites';
import { AI_ASSISTANTS, aiReferralShare, aiVisibility, googleStats, overview } from '@/lib/site/analytics';
import { dailyViews, topPaths } from '@/lib/site/views';
import { leadCounts } from '@/lib/site/leads';
import { addAiQuestionAction, removeAiQuestionAction, runAiChecksAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];
const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-CA'));

function Bars({ rows, empty }: { rows: { label: string; value: number; note?: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-body text-sm">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-1.5 text-sm">{rows.map((r) => (
      <li key={r.label} className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 2fr auto' }}>
        <span className="truncate">{r.label}</span><span className="h-2 rounded bg-paper-panel"><span className="block h-2 rounded" style={{ width: `${(r.value / max) * 100}%`, background: 'var(--accent)' }} /></span><span className="mono text-xs">{n(r.value)}{r.note ? ` ${r.note}` : ''}</span>
      </li>
    ))}</ul>
  );
}

function Spark({ series }: { series: { day: string; value: number }[] }) {
  if (series.length < 2) return null;
  const max = Math.max(...series.map((s) => s.value), 1);
  const w = 320, h = 48;
  const pts = series.map((s, i) => `${(i / (series.length - 1)) * w},${h - (s.value / max) * (h - 4) - 2}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden="true"><polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={pts} /></svg>;
}

/**
 * Analytics (ALL CAN §6.6): key metrics (visitors, page views, bounce, leads,
 * daily trend), traffic sources, search keywords, geography, top pages;
 * performance on Google (Search Console); performance on AI platforms
 * (referrals from assistants + the weekly citation checks).
 */
export default async function AnalyticsPage({ params, searchParams }: { params: { brand: string }; searchParams: { days?: string } }) {
  const brand = params.brand;
  const site = await getSite(brand);
  if (!site) notFound();
  const days = RANGES.includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const [ov, g, ai, aiRef, leads, top, daily] = await Promise.all([overview(site, days), googleStats(site, days), aiVisibility(brand), aiReferralShare(site, days), leadCounts(brand, days), topPaths(brand, days, 10), dailyViews(brand, days)]);
  const totalLeads = Object.values(leads).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="seg">{RANGES.map((d) => <Link key={d} href={`/sites/${brand}/analytics?days=${d}`} className={days === d ? 'on' : ''}>Last {d} days</Link>)}</nav>
        <span className="text-xs text-silver">{ov.source === 'vercel' ? 'Vercel Web Analytics' : 'Built-in page counters (connect Vercel Analytics for visitors, sources and geography)'}</span>
      </div>

      <section className="card p-0">
        <div className="card-head p-5 pb-0"><h2>Key metrics</h2></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          <div className="kpi"><span className="kpi-k">Visitors</span><span className="kpi-v">{n(ov.visitors)}</span><span className="kpi-d">{ov.changePct != null ? <span className={`chip-delta ${ov.changePct >= 0 ? 'up' : 'down'}`}>{ov.changePct >= 0 ? '+' : ''}{ov.changePct}%</span> : 'vs previous period n/a'}</span></div>
          <div className="kpi"><span className="kpi-k">Page views</span><span className="kpi-v">{n(ov.pageViews)}</span><span className="kpi-d">{days} days</span></div>
          <div className="kpi"><span className="kpi-k">Bounce rate</span><span className="kpi-v">{ov.bounceRate != null ? `${ov.bounceRate}%` : '—'}</span><span className="kpi-d">Left after one page</span></div>
          <div className="kpi"><span className="kpi-k">Leads</span><span className="kpi-v">{n(totalLeads)}</span><span className="kpi-d">{Object.entries(leads).map(([k, v]) => `${v} ${k}`).join(' · ') || 'Forms and interest'}</span></div>
        </div>
        <div className="px-5 pb-5"><Spark series={ov.daily.length ? ov.daily : daily.map((d) => ({ day: d.day, value: d.views }))} /></div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card flex flex-col gap-3 p-5"><div className="card-head"><h2>Traffic</h2><span className="card-head-lbl">Top pages</span></div><Bars rows={(ov.topPages.length ? ov.topPages : top.map((t) => ({ label: t.path, value: t.views })))} empty="No page views yet." /></section>
        <section className="card flex flex-col gap-3 p-5"><div className="card-head"><h2>Traffic sources</h2></div><Bars rows={ov.sources} empty="Sources need Vercel Analytics (direct, Google, Instagram, AI assistants, Athlete Institute sites)." /></section>
        <section className="card flex flex-col gap-3 p-5"><div className="card-head"><h2>Search keywords</h2><span className="card-head-lbl">From Google</span></div><Bars rows={g.queries.slice(0, 8).map((q) => ({ label: q.query, value: q.clicks, note: `· pos ${q.position.toFixed(1)}` }))} empty={g.connected ? 'No search clicks in this period.' : 'Connect Google Search Console (Settings) to see the words people searched.'} /></section>
        <section className="card flex flex-col gap-3 p-5"><div className="card-head"><h2>Geography</h2></div><Bars rows={ov.geography} empty="Geography needs Vercel Analytics." /></section>
      </div>

      <section className="card flex flex-col gap-3 p-5">
        <div className="card-head"><h2>Performance on Google</h2><span className="card-head-lbl">{g.connected ? 'Search Console' : 'Not connected'}</span></div>
        {g.connected ? (
          <>
            <div className="grid sm:grid-cols-4">
              <div className="kpi"><span className="kpi-k">Clicks</span><span className="kpi-v">{n(g.clicks)}</span></div>
              <div className="kpi"><span className="kpi-k">Impressions</span><span className="kpi-v">{n(g.impressions)}</span></div>
              <div className="kpi"><span className="kpi-k">Click rate</span><span className="kpi-v">{(g.ctr * 100).toFixed(1)}%</span></div>
              <div className="kpi"><span className="kpi-k">Average position</span><span className="kpi-v">{g.position.toFixed(1)}</span></div>
            </div>
            <Spark series={g.daily} />
            <Bars rows={g.pages.slice(0, 8).map((p) => ({ label: p.page, value: p.clicks, note: `· pos ${p.position.toFixed(1)}` }))} empty="No page data yet." />
          </>
        ) : <p className="text-body text-sm">Verify the site in Google Search Console, then add the service-account key in the environment (GOOGLE_SERVICE_ACCOUNT_JSON) and the property under Settings. Clicks, impressions, average position and the queries people used appear here.</p>}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="card-head"><h2>Performance on AI platforms</h2><span className="card-head-lbl">Referrals and citations</span></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div><p className="label mb-1 text-[10px]">Visits referred by assistants</p><Bars rows={aiRef.byAssistant} empty={aiRef.visits == null ? 'Needs Vercel Analytics.' : 'No AI referrals in this period.'} /></div>
          <div>
            <p className="label mb-1 text-[10px]">Does the assistant cite the site?</p>
            <p className="mb-2 text-xs text-silver">Checked weekly for each question below, against the assistants with an API key connected. Budget: questions × assistants per week.</p>
            <table className="data-table text-xs"><thead><tr><th>Question</th>{AI_ASSISTANTS.map((a) => <th key={a}>{a}</th>)}<th></th></tr></thead>
              <tbody>{ai.map((q) => <tr key={q.id}><td>{q.question}</td>{AI_ASSISTANTS.map((a) => { const r = q.results[a]; return <td key={a}><span className={`pill-status ${r?.result === 'cited' ? 'pos' : r?.result === 'mentioned' ? 'warn' : 'muted'}`}>{r ? r.result : '—'}</span></td>; })}<td><form action={removeAiQuestionAction}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={q.id} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Removed">×</SubmitButton></form></td></tr>)}</tbody></table>
            <div className="mt-2 flex flex-wrap gap-2">
              <form action={addAiQuestionAction} className="flex gap-1"><input type="hidden" name="brand" value={brand} /><input name="question" required placeholder="e.g. youth basketball league in Orangeville" className="input text-xs" /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Added">Add question</SubmitButton></form>
              <form action={runAiChecksAction}><input type="hidden" name="brand" value={brand} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="Checking…" doneLabel="Done">Run checks now</SubmitButton></form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
