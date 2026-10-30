'use client';

import { useState, useTransition } from 'react';
import { saveSeoWizardAction, suggestKeywordsAction } from '../../actions';
import { DESC_MAX, DESC_MIN, TITLE_MAX } from '@/lib/site/constants';

interface Props {
  brand: string; siteName: string;
  site: { title: string; description: string; ogImage: string; keywords: string[]; business: { name?: string; offer?: string; location_slugs?: string[] }; formats: { page?: string; location?: string; sport?: string; team?: string }; indexTeams: boolean; ai: { answers?: boolean; training?: boolean } };
  locations: { slug: string; name: string }[];
  suggestions: string[];
}

/**
 * Setup wizard (ALL CAN §6.5): 1 what the site is, 2 keywords (suggested from
 * the records, Claude can add more), 3 home title and description with a
 * Google-style preview. Writes the site SEO settings.
 */
export function SeoWizard({ brand, siteName, site, locations, suggestions }: Props) {
  const [step, setStep] = useState(0);
  const [kws, setKws] = useState<string[]>(site.keywords);
  const [title, setTitle] = useState(site.title);
  const [desc, setDesc] = useState(site.description);
  const [more, setMore] = useState<string[]>(suggestions.filter((s) => !site.keywords.includes(s)));
  const [pending, start] = useTransition();
  const toggle = (k: string) => setKws(kws.includes(k) ? kws.filter((x) => x !== k) : kws.length < 12 ? [...kws, k] : kws);
  const steps = ['About the site', 'Keywords', 'Home page'];
  return (
    <form action={async (fd) => { await saveSeoWizardAction(fd); }} className="flex flex-col gap-4">
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="keywords" value={kws.join('\n')} />
      <nav className="seg self-start">{steps.map((s, i) => <button key={s} type="button" className={step === i ? 'on' : ''} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}</nav>

      <div className={step === 0 ? 'grid gap-3 sm:grid-cols-2' : 'hidden'}>
        <div className="flex flex-col"><label className="field-label" htmlFor="sw-biz">What is {siteName}?</label><input id="sw-biz" name="bizName" defaultValue={site.business.name ?? siteName} className="input text-sm" /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor="sw-offer">What do you offer, in a line</label><input id="sw-offer" name="bizOffer" defaultValue={site.business.offer ?? ''} className="input text-sm" placeholder="Inclusive youth and adult sport leagues and skills" /></div>
        <div className="flex flex-col sm:col-span-2"><span className="field-label">Where</span><div className="flex flex-wrap gap-3">{locations.map((l) => <label key={l.slug} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="bizLocations" value={l.slug} defaultChecked={site.business.location_slugs?.includes(l.slug) ?? true} /> {l.name}</label>)}</div></div>
        <div className="flex flex-col"><label className="field-label" htmlFor="sw-og">Share image URL</label><input id="sw-og" name="ogImage" defaultValue={site.ogImage} className="input text-sm" placeholder="From Media: 1200×630 works best" /></div>
        <div className="flex flex-col gap-1 text-sm">
          <span className="field-label">Search and AI</span>
          <label className="flex items-center gap-2"><input type="checkbox" name="indexTeams" defaultChecked={site.indexTeams} /> Let Google index division and standings pages</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="aiAnswers" defaultChecked={site.ai.answers !== false} /> Let AI assistants read the site to answer questions</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="aiTraining" defaultChecked={site.ai.training === true} /> Allow AI training crawlers (off by default)</label>
        </div>
        <details className="sm:col-span-2 text-xs"><summary className="cursor-pointer text-silver">Title formats</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([['fmtPage', 'Page', site.formats.page], ['fmtLocation', 'Location', site.formats.location], ['fmtSport', 'Sport at location', site.formats.sport], ['fmtTeam', 'Team / division', site.formats.team]] as const).map(([n, l, v]) => <div key={n} className="flex flex-col"><label className="field-label" htmlFor={`sw-${n}`}>{l}</label><input id={`sw-${n}`} name={n} defaultValue={v ?? ''} className="input mono text-xs" /></div>)}
          </div><p className="mt-1 text-silver">Placeholders: {'{Page} {Location} {Sport} {Team} {Division}'}.</p></details>
        <div className="sm:col-span-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setStep(1)}>Next: keywords</button></div>
      </div>

      <div className={step === 1 ? 'flex flex-col gap-3' : 'hidden'}>
        <p className="text-body text-sm">Pick up to 12 phrases people would search for. The checklist checks that the home page and each location use at least one.</p>
        <div className="flex flex-wrap gap-2">{[...kws, ...more.filter((m) => !kws.includes(m))].map((k) => <button key={k} type="button" onClick={() => toggle(k)} className={`rounded-full border px-3 py-1 text-xs ${kws.includes(k) ? 'border-ink bg-ink text-white' : 'border-hairline'}`}>{k}</button>)}</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col"><label className="field-label" htmlFor="sw-kw">Add your own</label><input id="sw-kw" className="input text-sm" placeholder="youth basketball league toronto" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v) { toggle(v); (e.target as HTMLInputElement).value = ''; } } }} /></div>
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setMore([...more, ...(await suggestKeywordsAction(brand, kws)).filter((s) => !more.includes(s) && !kws.includes(s))]))}>{pending ? 'Thinking…' : 'Suggest more with Claude'}</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(2)}>Next: home page</button>
        </div>
      </div>

      <div className={step === 2 ? 'grid gap-4 md:grid-cols-2' : 'hidden'}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col"><label className="field-label" htmlFor="sw-title">Home page search title</label><input id="sw-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} className="input text-sm" maxLength={90} /><span className={`mt-1 text-xs ${title.length > TITLE_MAX ? 'text-[#b4483c]' : 'text-silver'}`}>{title.length} / {TITLE_MAX}</span></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="sw-desc">Default description</label><textarea id="sw-desc" name="description" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} className="input text-sm" maxLength={220} /><span className={`mt-1 text-xs ${desc.length < DESC_MIN || desc.length > DESC_MAX ? 'text-[#b4483c]' : 'text-silver'}`}>{desc.length} · aim for {DESC_MIN} to {DESC_MAX}</span></div>
          <div><button type="submit" className="btn-gold btn-sm">Save site setup</button></div>
        </div>
        <div className="rounded border border-hairline p-4">
          <p className="label mb-2 text-[10px]">How it looks on Google</p>
          <p className="text-xs text-silver">{siteName} › home</p>
          <p className="text-[18px] leading-tight" style={{ color: '#1a0dab' }}>{title.slice(0, TITLE_MAX)}{title.length > TITLE_MAX ? '…' : ''}</p>
          <p className="text-sm text-body">{desc.slice(0, DESC_MAX)}{desc.length > DESC_MAX ? '…' : ''}</p>
        </div>
      </div>
    </form>
  );
}
