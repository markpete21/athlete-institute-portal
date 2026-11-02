'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The page menu block: a bar that sticks under the site header with links to
 * the page's sections (#anchors) and a Register button. The link for the
 * section in view is marked; clicks scroll smoothly unless the visitor asks
 * for reduced motion. On phones the links scroll sideways and a Register bar
 * sits at the bottom of the screen once the menu has scrolled into its
 * sticky position.
 */
export default function PageNav({ items, ctaLabel, ctaHref, note }: { items: { label: string; href: string }[]; ctaLabel: string; ctaHref: string; note: string }) {
  const [active, setActive] = useState<string>('');
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const ext = /^https?:\/\//i.test(ctaHref) ? { target: '_blank', rel: 'noopener' } : {};

  useEffect(() => {
    const ids = items.map((i) => i.href).filter((h) => h.startsWith('#')).map((h) => h.slice(1));
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    // The section whose top has passed the bar (header 76px + bar) is the current one.
    const pick = () => {
      const line = 76 + 64;
      let cur = '';
      for (const e of els) if (e.getBoundingClientRect().top - line <= 1) cur = e.id;
      setActive(cur);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => { window.removeEventListener('scroll', pick); window.removeEventListener('resize', pick); };
  }, [items]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-77px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep the current link visible in the sideways-scrolling list on phones.
  useEffect(() => {
    const a = list.current?.querySelector<HTMLAnchorElement>(`a[href="#${active}"]`);
    if (a && list.current && list.current.scrollWidth > list.current.clientWidth) list.current.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' });
  }, [active]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('#')) return;
    const el = document.getElementById(href.slice(1));
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', href);
  };

  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      <nav className={`pnav${stuck ? ' is-stuck' : ''}`} aria-label="On this page">
        <div className="wrap">
          <ul ref={list}>{items.map((i) => (
            <li key={i.href}><a href={i.href} aria-current={active && `#${active}` === i.href ? 'true' : undefined} onClick={(e) => go(e, i.href)}>{i.label}</a></li>
          ))}</ul>
          {ctaLabel && ctaHref && <a className="pill pill--red pill--sm pnav-cta" href={ctaHref} {...ext}>{ctaLabel}</a>}
        </div>
      </nav>
      {ctaLabel && ctaHref && (
        <div className={`regbar${stuck ? ' show' : ''}`} aria-hidden={!stuck}>
          {note && <span className="regbar-note">{note}</span>}
          <a className="pill pill--red" href={ctaHref} tabIndex={stuck ? 0 : -1} {...ext}>{ctaLabel}</a>
        </div>
      )}
    </>
  );
}
