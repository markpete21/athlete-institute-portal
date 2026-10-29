import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Brand-site primitives (server-safe): the hairline/pill language from the
 * ALL CAN design system. Every renderer and page composes these so the site
 * reads as one system. Unconfirmed facts arrive as the literal "[TBC]" and are
 * rendered muted here (admin + preview); the live site shows "To be
 * confirmed" instead (see T()).
 */

export const Chev = () => <span className="chev" aria-hidden="true" />;

/** Text with [TBC] markers rendered as muted "To be confirmed" (live) or [TBC] (preview). */
export function T({ children, preview = false }: { children: string | null | undefined; preview?: boolean }) {
  const s = children ?? '';
  if (!s.includes('[TBC]')) return <>{s}</>;
  const parts = s.split('[TBC]');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <em className="tbc">{preview ? '[TBC]' : 'To be confirmed'}</em>}
        </span>
      ))}
    </>
  );
}

export function SecHead({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="sec-head">
      <span className="label">{label}</span>
      {right}
    </div>
  );
}

export function StatusPill({ label, live }: { label: string; live: boolean }) {
  return <span className={`status ${live ? 'status--live' : 'status--soon'}`}>{label}</span>;
}

export function FactsDl({ facts, preview }: { facts: [string, string][]; preview?: boolean }) {
  return (
    <dl className="facts">
      {facts.map(([k, v], i) => (
        <div key={`${k}-${i}`}>
          <dt>{k}</dt>
          <dd><T preview={preview}>{v}</T></dd>
        </div>
      ))}
    </dl>
  );
}

export function Crumbs({ items }: { items: [string, string][] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map(([label, href], i) =>
        i < items.length - 1 ? (
          <span key={i}>
            <Link href={href}>{label}</Link>
            <span aria-hidden="true">/</span>
          </span>
        ) : (
          <span key={i} aria-current="page">{label}</span>
        ),
      )}
    </nav>
  );
}

export function PageHead({ kicker, title, lede, crumbs, preview }: { kicker?: string; title: string; lede?: string | null; crumbs?: [string, string][]; preview?: boolean }) {
  return (
    <div className="wrap">
      {crumbs && <Crumbs items={crumbs} />}
      <div className="page-head">
        {kicker && <p className="kicker"><T preview={preview}>{kicker}</T></p>}
        <h1><T preview={preview}>{title}</T></h1>
        {lede && <p className="lede"><T preview={preview}>{lede}</T></p>}
      </div>
    </div>
  );
}

export function Row({ href, title, meta, end, muted }: { href?: string; title: string; meta?: ReactNode; end?: ReactNode; muted?: boolean }) {
  const inner = (
    <>
      <h3 className={muted ? 'muted' : undefined}>{title}</h3>
      {meta && <span className="meta">{meta}</span>}
      <span className="end">{end}{href && <Chev />}</span>
    </>
  );
  return href ? <Link className="row" href={href}>{inner}</Link> : <div className="row">{inner}</div>;
}

/** Section wrapper: `.sec` with the brand's vertical rhythm. */
export function Section({ children, id, tight, className }: { children: ReactNode; id?: string; tight?: boolean; className?: string }) {
  return (
    <section className={`sec${className ? ` ${className}` : ''}`} id={id} style={tight ? { paddingTop: 48 } : undefined}>
      <div className="wrap">{children}</div>
    </section>
  );
}

export function SplitGrid({ left, right, rowGap }: { left: ReactNode; right: ReactNode; rowGap?: number }) {
  return (
    <div className="grid" style={rowGap ? { rowGap } : undefined}>
      <div className="left">{left}</div>
      <div className="right">{right}</div>
    </div>
  );
}

export function NotFoundBlock({ home = '/' }: { home?: string }) {
  return (
    <>
      <PageHead kicker="Not found" title="Page not found." lede="That page doesn't exist or isn't published yet." crumbs={[['Home', home], ['Not found', '']]} />
      <div className="wrap" style={{ marginTop: 24, marginBottom: 80 }}>
        <Link className="pill pill--ink" href={home}>Go home</Link>
      </div>
    </>
  );
}
