'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { NavItem } from '@/lib/site/nav';
import AskSheet from '@/components/site/AskSheet';

/**
 * Brand-site header (ALL CAN §3): black bar, shield, top-level items set in
 * the nav face with a period, a mega panel per folder (hover with a pointer,
 * click/Enter for keyboard, Escape closes, focus returns), the phone drawer
 * (Ask + Sign in on top, folders as accordions), the signed-in chip with its
 * dropdown, and the Ask sheet. Pure client so the menus work without a round
 * trip; everything it shows was resolved on the server and passed as props.
 */

export interface HeaderLocation { slug: string; name: string; venue: string | null; status: { label: string; live: boolean }; photoUrl: string | null }
export interface HeaderSport { slug: string; name: string; markUrl: string; status: 'live' | 'soon' }
export interface HeaderUser { initials: string; first: string; name: string; email: string; canEdit: boolean }

export interface SiteHeaderProps {
  siteName: string;
  askName: string;
  shieldUrl: string;
  drawerLogoUrl: string;
  nav: NavItem[];
  locations: HeaderLocation[];
  sports: HeaderSport[];
  user: HeaderUser | null;
  /** Null when the host has no Clerk session (not a satellite): no Sign in link at all. */
  signInHref: string | null;
  signOutHref: string;
  accountHref: string;
  myTeamsHref: string;
  editorHref: string;
  askEnabled: boolean;
  askPrompts: string[];
  brandKey: string;
  preview: boolean;
  previewBack: string | null;
}

const withPeriod = (l: string) => (/[.!?]$/.test(l) ? l : `${l}.`);
const hrefOf = (n: NavItem) => n.href ?? '#';
const PDESC: Record<string, string> = { League: 'Youth league. Skills block, then games.', Skills: 'Skill sessions for every level.', Circuit: 'Rep teams, based in Orangeville.', 'Rep Circuit': 'League in Orangeville, ON' };

export default function SiteHeader(p: SiteHeaderProps) {
  const [open, setOpen] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [ask, setAsk] = useState(false);
  const [acct, setAcct] = useState(false);
  const [dacct, setDacct] = useState(false);
  const [tab, setTab] = useState<Record<number, number>>({});
  const hdrRef = useRef<HTMLElement>(null);
  const hover = () => typeof window !== 'undefined' && window.matchMedia('(hover:hover)').matches;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (acct) { setAcct(false); return; }
      if (ask) { setAsk(false); return; }
      if (open != null) { const id = open; setOpen(null); hdrRef.current?.querySelector<HTMLButtonElement>(`[data-mega="${id}"]`)?.focus(); return; }
      if (drawer) setDrawer(false);
    };
    const onDoc = (e: MouseEvent) => { if (acct && !(e.target as HTMLElement).closest('[data-acct-root]')) setAcct(false); };
    const onAsk = (e: Event) => { const t = (e.target as HTMLElement).closest?.('[data-ask]'); if (t) { e.preventDefault(); setDrawer(false); setAsk(true); } };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('click', onAsk);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDoc); document.removeEventListener('click', onAsk); };
  }, [acct, ask, open, drawer]);

  useEffect(() => { document.body.style.overflow = drawer || ask ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [drawer, ask]);

  const roots = p.nav;
  const current = open != null ? roots.find((r) => r.id === open) ?? null : null;

  return (
    <>
      {p.preview && (
        <div className="draftbar"><div className="wrap"><span><b>Draft preview.</b> Only editors can see this version.</span>{p.previewBack && <a href={p.previewBack}>Back to editor</a>}</div></div>
      )}
      <header className="hdr on-dark" ref={hdrRef} onMouseLeave={() => { if (hover()) setOpen(null); }}>
        <div className="wrap">
          <button className="menu-btn" type="button" aria-controls="site-drawer" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <span className="burger" aria-hidden="true"><i /><i /><i /></span>Menu
          </button>
          <Link className="brand" href="/" aria-label={`${p.siteName} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.shieldUrl} alt={p.siteName} />
          </Link>
          <nav className="nav" aria-label="Main">
            {roots.map((n) =>
              n.kind === 'folder' ? (
                <button key={n.id} type="button" data-mega={n.id} aria-expanded={open === n.id} aria-controls="site-mega"
                  onClick={() => setOpen(open === n.id ? null : n.id)}
                  onMouseEnter={() => { if (hover()) setOpen(n.id); }}>
                  {withPeriod(n.label)}
                </button>
              ) : (
                <a key={n.id} href={hrefOf(n)} target={n.newTab ? '_blank' : undefined} rel={n.newTab ? 'noopener' : undefined}>{withPeriod(n.label)}</a>
              ),
            )}
          </nav>
          <div className="hdr-right">
            {p.user ? (
              <span className="acct" data-acct-root>
                <button type="button" className="chip" aria-haspopup="true" aria-expanded={acct} aria-controls="acct-menu" title={p.user.name} onClick={() => setAcct(!acct)}>{p.user.initials}</button>
                {acct && (
                  <div className="acct-menu" id="acct-menu" role="menu">
                    <div className="who"><b>{p.user.name}</b><span className="muted" style={{ fontSize: 13 }}>{p.user.email}</span></div>
                    <AccountLinks p={p} />
                  </div>
                )}
              </span>
            ) : p.signInHref ? (
              <a className="signin" href={p.signInHref}>Sign in</a>
            ) : null}
            {p.askEnabled && <button type="button" className="pill pill--line pill--sm" onClick={() => setAsk(true)}>Ask {p.askName}</button>}
          </div>
        </div>
        <div className={`mega${current ? ' show' : ''}`} id="site-mega" role="region" aria-label="Menu panel" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(null); }}>
          {current && <MegaPanel n={current} p={p} tab={tab[current.id] ?? 0} setTab={(i) => setTab({ ...tab, [current.id]: i })} />}
        </div>
      </header>

      <div className={`scrim${drawer || ask ? ' show' : ''}`} onClick={() => { setDrawer(false); setAsk(false); }} />
      <aside className={`drawer${drawer ? ' show' : ''}`} id="site-drawer" aria-label="Menu" aria-hidden={!drawer}>
        <div className="drawer-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.drawerLogoUrl} alt={p.siteName} style={{ height: 24, width: 'auto' }} />
          <button className="x" type="button" onClick={() => setDrawer(false)}>Close<i aria-hidden="true" /></button>
        </div>
        <div className="drawer-body">
          <nav className="dnav" aria-label="Main" onClick={(e) => { const a = (e.target as HTMLElement).closest('a'); if (a && !a.hasAttribute('data-keep')) setDrawer(false); }}>
            <div className="dnav-top">
              {p.askEnabled ? <button type="button" className="pill pill--ink" onClick={() => { setDrawer(false); setAsk(true); }}>Ask {p.askName}</button> : <span />}
              {p.user ? (
                <button type="button" className="pill pill--line" aria-expanded={dacct} aria-controls="dnav-acct" onClick={() => setDacct(!dacct)}>
                  <span className="mini" aria-hidden="true">{p.user.initials}</span>{p.user.first}<span className="chev down" aria-hidden="true" />
                </button>
              ) : p.signInHref ? (
                <a className="pill pill--line" href={p.signInHref}>Sign in</a>
              ) : <span />}
            </div>
            {p.user && dacct && <div className="dnav-acct" id="dnav-acct"><span className="who">Signed in as {p.user.name}</span><AccountLinks p={p} /></div>}
            {roots.map((n) =>
              n.kind === 'folder' ? (
                <details key={n.id}>
                  <summary>{n.label}<span className="chev down" aria-hidden="true" /></summary>
                  <div className="sub">
                    {n.children.filter((c) => c.kind === 'folder').map((f) => (
                      <div key={f.id}>
                        <h4>{f.label}{f.meta.soon ? ` · ${f.meta.note || 'Coming soon.'}` : ''}</h4>
                        {f.meta.soon
                          ? <a href={`/locations?sport=${f.meta.sport ?? ''}#request`}>Request {f.label.toLowerCase()} near you<span className="chev" aria-hidden="true" /></a>
                          : f.children.map((g) => <a key={g.id} href={hrefOf(g)}>{g.label}<span className="chev" aria-hidden="true" /></a>)}
                      </div>
                    ))}
                    {n.children.some((c) => c.kind === 'folder') && n.children.some((c) => c.kind !== 'folder' && !c.featured) && <span className="sub-gap" aria-hidden="true" />}
                    {n.children.filter((c) => c.kind !== 'folder' && !c.featured).map((c) => (
                      <a key={c.id} href={hrefOf(c)} target={c.newTab ? '_blank' : undefined} rel={c.newTab ? 'noopener' : undefined}>{c.label}<span className="chev" aria-hidden="true" /></a>
                    ))}
                  </div>
                </details>
              ) : (
                <a key={n.id} href={hrefOf(n)} target={n.newTab ? '_blank' : undefined} rel={n.newTab ? 'noopener' : undefined}>{n.label}</a>
              ),
            )}
          </nav>
        </div>
      </aside>

      {p.askEnabled && <AskSheet open={ask} onClose={() => setAsk(false)} brandKey={p.brandKey} askName={p.askName} prompts={p.askPrompts} />}
    </>
  );
}

function AccountLinks({ p }: { p: SiteHeaderProps }) {
  return (
    <>
      <a href={p.myTeamsHref} data-keep>My teams and schedule<span className="chev" aria-hidden="true" /></a>
      <a href={p.accountHref} target="_blank" rel="noopener">My account on Play<span className="chev" aria-hidden="true" /></a>
      {p.user?.canEdit && <a href={p.editorHref}>Site editor<span className="chev" aria-hidden="true" /></a>}
      <a href={p.signOutHref}>Sign out</a>
    </>
  );
}

/** The dropdown for one root folder. Play and Locations have bespoke layouts; the rest use columns. */
function MegaPanel({ n, p, tab, setTab }: { n: NavItem; p: SiteHeaderProps; tab: number; setTab: (i: number) => void }) {
  const folders = n.children.filter((c) => c.kind === 'folder');
  const loose = n.children.filter((c) => c.kind !== 'folder' && !c.featured);
  const feat = n.children.find((c) => c.featured);
  // A featured card is either the ink well with a title, or (meta.card = logo)
  // the item's image alone on white, e.g. the ALL CAN Circuit lockup.
  const featHTML = feat && (
    <a className="mega-feature" href={hrefOf(feat)}>
      {feat.meta.card === 'logo' && feat.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="well well--logo"><img src={feat.imageUrl} alt={feat.label} /></div>
      ) : (
        <div className="well on-dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {feat.imageUrl ? <img src={feat.imageUrl} alt="" /> : null}
          <p className="kicker" style={{ color: 'var(--silver)' }}>Featured</p>
          <h3 style={{ marginTop: 6 }}>{withPeriod(feat.label)}</h3>
        </div>
      )}
      <span style={{ fontSize: 15 }}>{feat.description}<span className="chev" aria-hidden="true" /></span>
    </a>
  );

  // Play: sport tabs across the top; each a pill with its mark.
  const isPlay = folders.length > 0 && folders.every((f) => f.meta.sport || p.sports.some((s) => s.name === f.label));
  if (isPlay && n.label.toLowerCase() === 'play') {
    const sports = folders.map((f) => ({ f, sp: p.sports.find((s) => s.slug === f.meta.sport || s.name === f.label) ?? null }));
    const cur = sports[Math.min(tab, sports.length - 1)];
    return (
      <div className="wrap">
        <div className="mega-title mega-title--narrow"><h2>Play<span className="ac-ball" aria-hidden="true" /><span className="sr">.</span></h2></div>
        <div className="mega-play">
          <div className="ptabs" role="tablist" aria-label="Sports" onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const i = e.key === 'Home' ? 0 : e.key === 'End' ? sports.length - 1 : (tab + (e.key === 'ArrowRight' ? 1 : -1) + sports.length) % sports.length;
            setTab(i);
            (e.currentTarget.children[i] as HTMLElement | undefined)?.focus();
          }}>
            {sports.map(({ f, sp }, i) => (
              <button key={f.id} type="button" role="tab" className="ptab" id={`pt-${f.id}`} aria-controls={`pp-${f.id}`} aria-selected={i === tab} tabIndex={i === tab ? 0 : -1} onClick={() => setTab(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {sp && <img src={sp.markUrl} alt="" aria-hidden="true" />}{f.label}
              </button>
            ))}
          </div>
          {cur && (
            <div className="ppanel" role="tabpanel" id={`pp-${cur.f.id}`} aria-labelledby={`pt-${cur.f.id}`}>
              {cur.f.meta.soon ? (
                <p className="soon-line">{cur.f.meta.note || 'Coming soon.'}</p>
              ) : (
                <div className="mega-col">
                  {cur.f.children.map((g) => (
                    <a key={g.id} href={hrefOf(g)}>
                      <span><b>{g.label}</b>{(g.description || PDESC[g.label]) ? <> <span className="muted">{g.description || PDESC[g.label]}</span></> : null}</span>
                      <span className="chev" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
              {cur.f.meta.soon && (
                <a className="sport-req" href={`/locations?sport=${cur.sp?.slug ?? ''}#request`}>
                  Request {cur.f.label.toLowerCase()} near you<span className="chev" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
        {featHTML}
      </div>
    );
  }

  // Locations: cards for each location page inside the region folders, links beside them.
  if (n.label.toLowerCase() === 'locations') {
    const cards = folders.flatMap((f) => f.children).map((g) => p.locations.find((l) => `/${l.slug}` === g.href) ?? null).filter((l): l is HeaderLocation => !!l);
    return (
      <div className="wrap">
        <div className="mega-loc">
          <h2>Locations.</h2>
          <div className="loc-row">
            <div className="loc-cards">
              {cards.map((l) => (
                <a key={l.slug} className="loc-card" href={`/${l.slug}`}>
                  <div className="loc-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {l.photoUrl ? <img src={l.photoUrl} alt="" /> : <span className="kicker">Venue photo <em className="tbc">[TBC]</em></span>}
                  </div>
                  <div className="loc-meta"><h3>{l.name}</h3><p className="muted">{l.venue}</p></div>
                  <span className={`status ${l.status.live ? 'status--live' : 'status--soon'}`}>{l.status.label}</span>
                </a>
              ))}
            </div>
            <div className="mega-col loc-more">
              {loose.map((g) => <a key={g.id} href={hrefOf(g)}><span>{g.label}</span><span className="chev" aria-hidden="true" /></a>)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="mega-title"><h2>{withPeriod(n.label)}</h2></div>
      <div className="mega-cols">
        {loose.length > 0 && (
          <div className="mega-col">
            {folders.length > 0 && <h3>More</h3>}
            {loose.map((g) => <a key={g.id} href={hrefOf(g)} target={g.newTab ? '_blank' : undefined} rel={g.newTab ? 'noopener' : undefined}><span>{g.label}</span><span className="chev" aria-hidden="true" /></a>)}
          </div>
        )}
        {folders.map((f) => (
          <div key={f.id} className="mega-col">
            <h3>{f.label}</h3>
            {f.children.map((g) => <a key={g.id} href={hrefOf(g)}><span>{g.label}{g.meta.note ? <> <span className="muted" style={{ fontSize: 13 }}>· {g.meta.note}</span></> : null}</span>{f.meta.soon ? <span className="soon">Soon</span> : <span className="chev" aria-hidden="true" />}</a>)}
          </div>
        ))}
      </div>
      {featHTML}
    </div>
  );
}
