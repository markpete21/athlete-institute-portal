import Link from 'next/link';
import { auth, currentUser } from '@clerk/nextjs/server';
import PlayWordmark from '@/components/brand/PlayWordmark';
import AppsMenu from '@/components/nav/AppsMenu';
import UpcomingBanner from '@/components/compete/UpcomingBanner';
import { listPrograms } from '@/lib/compete/compete';
import { ECOSYSTEM_LINKS } from '@ai/foundation';

export const dynamic = 'force-dynamic';

/**
 * Compete. Portal chrome — the PUBLIC competitive site. Nothing here is gated:
 * this is a page a parent forwards to a grandparent, and it must render for a
 * visitor with no session at all.
 *
 * It IS session-aware, though. The portal shares one Clerk instance across
 * play./admin./compete., so a session started on any of them is already valid
 * here — signing in on Play and clicking through to Compete keeps you signed
 * in, and vice versa. All this chrome does is REFLECT that: signed out shows a
 * login link (Clerk returns you to the page you were reading), signed in shows
 * your initials. Anything that should be richer for a signed-in visitor can key
 * off `userId` — but the public view must keep working without one.
 */
const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

/** Two letters for the signed-in chip — name first, email as the fallback. */
async function initials(): Promise<string> {
  const u = await currentUser().catch(() => null);
  const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
  if (name) return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const email = u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses[0]?.emailAddress;
  return (email?.slice(0, 2) ?? 'ME').toUpperCase();
}

export default async function CompeteLayout({ children }: { children: React.ReactNode }) {
  const [{ userId }, programs] = await Promise.all([auth(), listPrograms()]);
  const chip = userId ? await initials() : null;

  return (
    <div className="compete-shell">
      <header className="cs-topbar">
        <div className="cs-topbar-in">
          {/* Same 25px as the Play. App lockup — the two headers should read
              as one family, not two sizes. */}
          <PlayWordmark variant="compete" href="/" size={25} className="cs-brand" />
          <nav className="cs-nav">
            <a href="/">Divisions</a>
            <a href={`${PLAY_URL}/schedule`}>Facility schedule</a>
            {/* Slice 7: household schedule, signed-in only. Compete stays
                auth-free — this LINKS to the gated Play timeline, it never
                gates anything here. */}
            {chip && <a href={`${PLAY_URL}/account`}>My schedule</a>}
          </nav>
          {/* Signed out: the real Play lockup (dribbling ball and all) reading
              LOGIN in the same mono qualifier treatment this bar uses for
              PORTAL. Sign-in is served on THIS host, so Clerk returns the
              visitor to the standings they were reading. Signed in: the same
              lockup reads APP and jumps to their Play account (Mark's spec:
              "Play. LOGIN" out, "Play. APP" in). */}
          {chip ? (
            <a className="cs-toplay" href={`${PLAY_URL}/account`} title={`Your account (${chip})`}>
              <PlayWordmark qualifier="App" size={17} />
            </a>
          ) : (
            <Link className="cs-toplay" href="/sign-in">
              <PlayWordmark qualifier="Login" size={17} />
            </Link>
          )}
          {/* THE shared apps menu (hub manifest) — public apps only here. */}
          <AppsMenu current="compete" />
        </div>
        {/* Programs across the top, league-site style: each published
            program is a tab; one division links straight in, several link to
            the program's group on the home page. */}
        {programs.length > 0 && (
          <nav className="cs-progbar" aria-label="Programs">
            {/* Program tabs open the league's landing page (slice 4) — its
                own front door with brand, sponsors and divisions. */}
            {programs.map((p) => (
              <a key={p.programId} href={`/p/${p.programId}`} className="cs-prog">
                {p.programName}
              </a>
            ))}
          </nav>
        )}
      </header>

      {/* Upcoming games, site-wide. */}
      <UpcomingBanner />

      <main className="cs-main">{children}</main>

      <footer className="cs-foot">
        <div className="cs-foot-in">
          <span className="label">Athlete Institute</span>
          <div className="cs-foot-links">
            <a href={`${PLAY_URL}/account`}>Play. App</a>
            <a href={`${PLAY_URL}/programs`}>Register</a>
            <a href={ECOSYSTEM_LINKS.hub}>All apps</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
