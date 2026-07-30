import Link from 'next/link';
import { auth, currentUser } from '@clerk/nextjs/server';
import PlayWordmark from '@/components/brand/PlayWordmark';
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
  const { userId } = await auth();
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
          </nav>
          {/* Signed out: the real Play lockup (dribbling ball and all) reading
              LOGIN in the same mono qualifier treatment this bar uses for
              PORTAL. Sign-in is served on THIS host, so Clerk returns the
              visitor to the standings they were reading. Signed in: their
              initials, linking to the account over on Play. */}
          {chip ? (
            <a className="cs-me" href={`${PLAY_URL}/account`} title="Your account">
              {chip}
            </a>
          ) : (
            <Link className="cs-toplay" href="/sign-in">
              <PlayWordmark qualifier="Login" size={17} />
            </Link>
          )}
        </div>
      </header>

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
