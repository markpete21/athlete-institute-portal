import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import SiteHeader, { type HeaderUser } from '@/components/site/SiteHeader';
import SiteFooter from '@/components/site/SiteFooter';
import LeadForm from '@/components/site/LeadForm';
import { siteContext, type SiteContext } from '@/lib/site/context';
import { listLocations, locationStatusLabel, SPORTS } from '@/lib/site/records';
import { listMedia } from '@/lib/site/media';
import { siteRoleFor } from '@/lib/site/scopes';
import { getPortalSession } from '@/lib/auth';
import { bumpView } from '@/lib/site/views';
import { organizationJsonLd } from '@/lib/site/seo';
import { gateCookieName, gateUnlocked } from '@/lib/site/preview';
import { getSiteSession } from '@/lib/site/editor-session';
import '../site.css';

export const dynamic = 'force-dynamic';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca';

/**
 * Brand-site shell (Module 23 §1.2, §3; ALL CAN §3). Resolves the site from the
 * middleware's x-site-brand header, applies the theme tokens, the launch
 * switch (off = 404, coming soon = one page, live = full site; a valid preview
 * token sees the full draft site), the header with the public menu, the Ask
 * sheet and the footer. Everything renders for a signed-out visitor; a session
 * only lights up the account chip.
 */
async function ctxFromRequest(brand: string): Promise<SiteContext | null> {
  const h = headers();
  const path = h.get('x-portal-path') ?? '/';
  const q = path.includes('?') ? path.split('?')[1] : '';
  const token = new URLSearchParams(q).get('preview') ?? h.get('x-site-preview');
  return siteContext(brand, token);
}

export async function generateMetadata({ params }: { params: { brand: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  if (!ctx) return {};
  const { site } = ctx;
  return {
    title: { default: site.seo.title || site.name, template: site.seo.title_formats?.page?.replace('{Page}', '%s') ?? `%s · ${site.name}` },
    description: site.seo.default_description,
    metadataBase: new URL(ctx.origin),
    robots: site.status === 'live' && !site.settings.gate_password ? undefined : { index: false, follow: false },
    openGraph: { siteName: site.name, type: 'website', images: site.seo.og_image_url ? [site.seo.og_image_url] : undefined },
    icons: site.seo.favicon_url
      ? { icon: [{ url: site.seo.favicon_url, type: 'image/png' }], apple: [{ url: site.seo.favicon_url.replace(/[^/]+$/, 'apple-touch-icon.png') }] }
      : { icon: [{ url: `/favicons/play.svg`, type: 'image/svg+xml' }] },
  };
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: { brand: string } }) {
  const ctx = await ctxFromRequest(params.brand);
  if (!ctx) notFound();
  const { site, theme, themeVars, nav, preview, accountOnHost } = ctx;
  const h = headers();
  const path = (h.get('x-portal-path') ?? '/').split('?')[0];

  if (site.status === 'off' && !preview) notFound();

  // Session is optional: the brand host only has one once its Clerk satellite
  // domain is configured. Never let a missing session break the page.
  let user: HeaderUser | null = null;
  let canEdit = false;
  try {
    const { userId } = accountOnHost ? await auth() : { userId: null };
    if (userId) {
      const u = await currentUser();
      // The editor role is a bonus on top of the account button: a profile
      // lookup failure must not hide the button itself.
      try { canEdit = !!(await siteRoleFor(await getPortalSession(), site.brandKey)); } catch { canEdit = false; }
      const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.primaryEmailAddress?.emailAddress || 'You';
      user = { initials: name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(), first: u?.firstName ?? name.split('@')[0], name, email: u?.primaryEmailAddress?.emailAddress ?? '', canEdit , via: 'clerk' };
    }
  } catch {
    user = null;
  }
  // An editor signed in through the Admin hand-off (no Clerk session here yet)
  // still gets the editor chip and skips the password page.
  if (!user) {
    try {
      const es = await getSiteSession(site.brandKey);
      if (es.via === 'cookie' && es.userId && (await siteRoleFor(es, site.brandKey))) {
        canEdit = true;
        const name = es.email ?? 'Editor';
        user = { initials: name.slice(0, 2).toUpperCase(), first: name.split('@')[0], name, email: es.email ?? '', canEdit: true , via: 'editor' };
      }
    } catch { /* no editor cookie */ }
  }

  const [locations, media] = await Promise.all([listLocations(site.brandKey), listMedia(site.brandKey)]);
  const logo = (n: string) => media.find((m) => m.name === n)?.url ?? null;
  const shield = logo('shield-on-black.png') ?? `/sites/${site.brandKey}/logos/shield-on-black.png`;
  const drawerLogo = logo('sport-horizontal-leaf-red.png') ?? logo('sport-horizontal-on-black.png') ?? shield;
  const footerLogo = logo('sport-horizontal-on-black.png');
  const partners = media.filter((m) => m.folder === 'Partners' && !m.decorative).map((m) => ({ name: m.alt ?? m.name, logoUrl: m.url, factor: m.name.includes('athlete-institute') ? 0.58 : m.name.includes('nccp') ? 0.661 : m.name.includes('safe-sport') ? 0.579 : 1 }));

  // Password gate: on for everyone except previews and signed-in site members.
  const gate = site.settings.gate_password ?? null;
  const unlocked = !!gate && gateUnlocked(cookies().get(gateCookieName(site.brandKey))?.value, site.brandKey, gate);
  if (gate && site.status !== 'off' && !preview && !canEdit && !unlocked) {
    const back = h.get('x-portal-path') ?? '/';
    const wrong = back.includes('gate=wrong');
    return (
      <div className="site" style={themeVars as React.CSSProperties}>
        {theme.fontsHref && <link rel="stylesheet" href={theme.fontsHref} />}
        <main className="soon on-dark">
          <div className="wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shield} alt={site.name} style={{ height: 96, width: 'auto' }} />
            <h1>Almost ready.</h1>
            <p className="sub">{site.settings.gate_message || `${site.name} is being finished. Enter the password to take a look.`}</p>
            <form method="post" action="/api/site/gate" className="soon-form" style={{ display: 'grid', gap: 10 }}>
              <input type="hidden" name="brandKey" value={site.brandKey} />
              <input type="hidden" name="back" value={back.replace(/[?&]gate=wrong/, '')} />
              <label htmlFor="gate-pw" className="label">Password</label>
              <input id="gate-pw" name="password" type="password" autoComplete="current-password" required autoFocus style={{ padding: '12px 14px', fontSize: 16, border: '1px solid var(--silver)', background: 'transparent', color: 'var(--white)' }} />
              {wrong && <p className="note" role="alert" style={{ color: 'var(--site-accent)' }}>That password isn&apos;t right.</p>}
              <button type="submit" className="pill pill--red" style={{ justifySelf: 'start' }}>Enter</button>
            </form>
            <p className="note">Team member? <a href="/admin">Open the editor</a>.</p>
          </div>
        </main>
      </div>
    );
  }

  // Someone who got past the password sees the whole (published) site even
  // while the launch switch sits at Coming soon: the password is the gate.
  if (site.status !== 'live' && !preview && !unlocked && !(gate && canEdit)) {
    void bumpView(site.brandKey, '/coming-soon');
    return (
      <div className="site" style={themeVars as React.CSSProperties}>
        {theme.fontsHref && <link rel="stylesheet" href={theme.fontsHref} />}
        <main className="soon on-dark">
          <div className="wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shield} alt={site.name} style={{ height: 96, width: 'auto' }} />
            <h1>{site.comingSoon.headline ?? `${site.name} is coming.`}</h1>
            <p className="sub">{site.comingSoon.body}</p>
            {site.comingSoon.show_email_capture !== false && <div className="soon-form"><LeadForm brandKey={site.brandKey} variant="interest" context={site.name} siteName={site.name} /></div>}
            <p className="note">Already registered? <a href={site.links.play_url ?? PLAY_URL}>Open Play. App</a></p>
          </div>
        </main>
      </div>
    );
  }

  void bumpView(site.brandKey, path);
  const askName = site.name.replace(/\s+Sport$/i, '');
  const jsonLd = await organizationJsonLd(site, ctx.origin);
  // Server-side fallback only: on a satellite the client swaps it for Clerk's
  // buildSignInUrl() (components/site/SignInLink), which adds the sync marker.
  const signIn = `${PLAY_URL}/sign-in?redirect_url=${encodeURIComponent(`${ctx.origin}${path}`)}`;

  return (
    <div className="site" style={themeVars as React.CSSProperties} data-theme={theme.key}>
      {theme.fontsHref && <link rel="stylesheet" href={theme.fontsHref} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader
        siteName={site.name}
        askName={askName}
        shieldUrl={shield}
        drawerLogoUrl={drawerLogo}
        nav={nav}
        locations={locations.map((l) => ({ slug: l.slug, name: l.name, venue: l.venue, status: locationStatusLabel(l), photoUrl: l.photoUrl }))}
        sports={SPORTS.map((s) => ({ slug: s.slug, name: s.name, markUrl: s.markUrl, status: s.status }))}
        user={user}
        signInHref={accountOnHost ? signIn : null}
        signOutHref="/api/site/signout"
        accountHref={`${site.links.play_url ?? PLAY_URL}/account`}
        myTeamsHref="/my-teams"
        editorHref="/admin"
        askEnabled={site.settings.ask_enabled !== false}
        askPrompts={['When does registration open?', 'What ages can play?', 'Where is the closest location?', 'Is there financial help?']}
        brandKey={site.brandKey}
        preview={preview}
        previewBack={preview ? '/admin/pages' : null}
      />
      <main id="main" tabIndex={-1}>{children}</main>
      <SiteFooter site={site} logoUrl={footerLogo} partners={partners} />
    </div>
  );
}
