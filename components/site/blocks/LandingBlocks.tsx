import { SecHead, T } from '@/components/site/ui';
import PageNav from '@/components/site/PageNav';
import type { RenderCtx } from '@/components/site/blocks/BlockRenderer';

/**
 * Landing-page sections (Toronto Midtown, Nov 2026): page menu, key facts,
 * division cards, steps, schedule, checklist, person and venue. Each is a
 * plain block the editor fills in; empty photo slots render as labelled
 * spots (the caption is the brief) so a page reads complete while media is
 * gathered. Buttons that leave the site open in a new tab.
 */
type Props = Record<string, never>;
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = <X,>(v: unknown) => ((Array.isArray(v) ? v : []) as X[]);
const ext = (href: string) => (/^https?:\/\//i.test(href) ? { target: '_blank', rel: 'noopener' } : {});

function Btn({ label, href, tone = 'red' }: { label: string; href: string; tone?: 'red' | 'ink' | 'line' | 'white' }) {
  if (!label || !href) return null;
  return <a className={`pill pill--${tone}`} href={href} {...ext(href)}>{label}</a>;
}

function PhotoSpot({ url, alt, caption, preview, portrait }: { url: string; alt: string; caption: string; preview: boolean; portrait?: boolean }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`lp-photo${portrait ? ' lp-photo--portrait' : ''}`} src={url} alt={alt} loading="lazy" />;
  }
  return (
    <div className={`ph${portrait ? ' ph--portrait' : ''}`}>
      <span className="kicker">Photo <em className="tbc">{preview ? '[TBC]' : 'coming'}</em></span>
      {preview && caption && <span className="note">{caption}</span>}
    </div>
  );
}

export function PageNavBlock({ p }: { p: Props }) {
  return <PageNav items={arr<{ label: string; href: string }>(p.items)} ctaLabel={s(p.ctaLabel)} ctaHref={s(p.ctaHref)} note={s(p.note)} />;
}

export function KeyFacts({ p, ctx }: { p: Props; ctx: RenderCtx }) {
  const items = arr<{ label: string; value: string }>(p.items);
  return (
    <section className="sec sec--tight"><div className="wrap">
      {s(p.label) && <SecHead label={s(p.label)} />}
      <dl className="kf">{items.map((x, i) => <div key={i}><dt>{x.label}</dt><dd><T preview={ctx.preview}>{x.value}</T></dd></div>)}</dl>
      {(s(p.ctaLabel) || s(p.note)) && <div className="kf-foot"><Btn label={s(p.ctaLabel)} href={s(p.ctaHref)} />{s(p.note) && <p className="note"><T preview={ctx.preview}>{s(p.note)}</T></p>}</div>}
    </div></section>
  );
}

export function DivisionCards({ p, ctx }: { p: Props; ctx: RenderCtx }) {
  const items = arr<{ name: string; ages: string; when: string; note: string }>(p.items);
  return (
    <section className="sec"><div className="wrap">
      {s(p.label) && <SecHead label={s(p.label)} />}
      {/* With a heading: heading left, intro right, footnote under the cards. Without one: intro left, footnote right, above the cards. */}
      {s(p.heading) ? (
        <div className="grid lp-intro"><div className="left"><h2>{s(p.heading)}</h2></div><div className="right">{s(p.intro) && <p className="muted"><T preview={ctx.preview}>{s(p.intro)}</T></p>}</div></div>
      ) : (s(p.intro) || s(p.footnote)) ? (
        <div className="grid lp-intro"><div className="left">{s(p.intro) && <p className="lp-lede"><T preview={ctx.preview}>{s(p.intro)}</T></p>}</div><div className="right">{s(p.footnote) && <p className="muted"><T preview={ctx.preview}>{s(p.footnote)}</T></p>}</div></div>
      ) : null}
      <div className="divs">{items.map((d, i) => (
        <article key={i} className="div-card">
          <p className="div-name">{d.name}</p>
          <dl className="div-facts">
            {d.ages && <div><dt>Ages</dt><dd><T preview={ctx.preview}>{d.ages}</T></dd></div>}
            {d.when && <div><dt>When</dt><dd><T preview={ctx.preview}>{d.when}</T></dd></div>}
          </dl>
          {d.note && <p className="note"><T preview={ctx.preview}>{d.note}</T></p>}
          <div className="div-cta"><Btn label={s(p.ctaLabel) ? `${s(p.ctaLabel)} · ${d.name}` : ''} href={s(p.ctaHref)} tone="ink" /></div>
        </article>
      ))}</div>
      {s(p.heading) && s(p.footnote) && <p className="note" style={{ marginTop: 16 }}><T preview={ctx.preview}>{s(p.footnote)}</T></p>}
    </div></section>
  );
}

export function Steps({ p, ctx }: { p: Props; ctx: RenderCtx }) {
  const items = arr<{ title: string; body: string }>(p.items);
  return (
    <section className="sec"><div className="wrap">
      {s(p.label) && <SecHead label={s(p.label)} />}
      {s(p.heading) && <h2 className="lp-h2">{s(p.heading)}</h2>}
      <ol className="steps">{items.map((x, i) => (
        <li key={i}><span className="step-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><h3>{x.title}</h3>{x.body && <p className="muted"><T preview={ctx.preview}>{x.body}</T></p>}</li>
      ))}</ol>
    </div></section>
  );
}

export function Timeline({ p, ctx }: { p: Props; ctx: RenderCtx }) {
  const items = arr<{ label: string; date: string; tag: string }>(p.items);
  return (
    <section className="sec"><div className="wrap">
      {s(p.label) && <SecHead label={s(p.label)} />}
      <div className="grid" style={{ rowGap: 24 }}>
        <div className="left">{s(p.heading) && <h2>{s(p.heading)}</h2>}{s(p.note) && <p className="muted" style={{ marginTop: 12 }}><T preview={ctx.preview}>{s(p.note)}</T></p>}</div>
        <div className="right"><ol className="sched-tl">{items.map((x, i) => (
          <li key={i} className={x.tag ? 'is-key' : undefined}><span className="sched-tl-label">{x.label}</span><span className="sched-tl-date"><T preview={ctx.preview}>{x.date}</T></span>{x.tag ? <span className="status status--live">{x.tag}</span> : <span />}</li>
        ))}</ol></div>
      </div>
    </div></section>
  );
}

export function Checklist({ p, ctx }: { p: Props; ctx: RenderCtx }) {
  const items = arr<{ text: string }>(p.items);
  const hasPhoto = !!(s(p.imageUrl) || s(p.caption));
  return (
    <section className="sec"><div className="wrap">
      {s(p.label) && <SecHead label={s(p.label)} />}
      <div className="grid" style={{ rowGap: 32 }}>
        <div className="left">
          {s(p.heading) && <h2>{s(p.heading)}</h2>}
          {s(p.intro) && <p className="muted" style={{ marginTop: 12 }}><T preview={ctx.preview}>{s(p.intro)}</T></p>}
          <ul className="checks">{items.map((x, i) => <li key={i}><T preview={ctx.preview}>{x.text}</T></li>)}</ul>
          {s(p.ctaLabel) && <div style={{ marginTop: 24 }}><Btn label={s(p.ctaLabel)} href={s(p.ctaHref)} /></div>}
        </div>
        {hasPhoto && <div className="right"><figure className="fig"><PhotoSpot url={s(p.imageUrl)} alt={s(p.imageAlt)} caption={s(p.caption)} preview={ctx.preview} />{s(p.imageUrl) && s(p.caption) && <figcaption className="note">{s(p.caption)}</figcaption>}</figure></div>}
      </div>
    </div></section>
  );
}

export function Person({ p, ctx }: { p: Props; ctx: RenderCtx }) {
  return (
    <section className="sec"><div className="wrap">
      {s(p.label) && <SecHead label={s(p.label)} />}
      <div className="grid person" style={{ rowGap: 28 }}>
        <div className="left">{s(p.videoUrl) ? (
          // Muted, looping and inline so it plays on phones; controls let a visitor turn the sound on.
          <video className="lp-photo lp-photo--portrait lp-video" src={s(p.videoUrl)} poster={s(p.imageUrl) || undefined} aria-label={s(p.videoLabel) || `Video: ${s(p.name)}`} autoPlay muted loop playsInline controls preload="metadata" />
        ) : <PhotoSpot url={s(p.imageUrl)} alt={s(p.imageAlt)} caption={s(p.caption)} preview={ctx.preview} portrait />}</div>
        <div className="right">
          <h2>{s(p.name)}</h2>
          {s(p.role) && <p className="kicker" style={{ marginTop: 10 }}>{s(p.role)}</p>}
          {s(p.bio) && s(p.bio).split(/\n{2,}/).map((para, i) => <p key={i} style={{ marginTop: i ? 12 : 20 }}><T preview={ctx.preview}>{para}</T></p>)}
          {s(p.linkLabel) && s(p.linkHref) && <p style={{ marginTop: 20 }}><a href={s(p.linkHref)} {...ext(s(p.linkHref))}>{s(p.linkLabel)}<span className="chev" aria-hidden="true" /></a></p>}
        </div>
      </div>
    </div></section>
  );
}

export function Venue({ p, ctx }: { p: Props; ctx: RenderCtx }) {
  const facts = arr<[string, string]>(p.facts);
  return (
    <section className="sec"><div className="wrap">
      {s(p.label) && <SecHead label={s(p.label)} />}
      <div className="grid" style={{ rowGap: 28 }}>
        <div className="left">
          <h2>{s(p.name)}</h2>
          {s(p.address) && <p className="venue-addr">{s(p.address)}</p>}
          {facts.length > 0 && <dl className="facts" style={{ marginTop: 20 }}>{facts.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd><T preview={ctx.preview}>{v}</T></dd></div>)}</dl>}
          {s(p.directionsUrl) && <div style={{ marginTop: 24 }}><Btn label="Get directions" href={s(p.directionsUrl)} tone="line" /></div>}
        </div>
        <div className="right"><PhotoSpot url={s(p.imageUrl)} alt={s(p.imageAlt)} caption="" preview={ctx.preview} /></div>
        {s(p.mapEmbedUrl) && <div className="full"><div className="video map"><iframe src={s(p.mapEmbedUrl)} title={`Map: ${s(p.name)}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div></div>}
      </div>
    </div></section>
  );
}
