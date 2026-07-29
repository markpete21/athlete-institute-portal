import PlayWordmark from '@/components/brand/PlayWordmark';
import { ECOSYSTEM_LINKS } from '@ai/foundation';

export const dynamic = 'force-dynamic';

/**
 * Compete. Portal chrome — the PUBLIC competitive site. No auth, no account
 * furniture: this is a page a parent forwards to a grandparent. The only
 * account-ish thing is a prominent way back to Play. Portal to register.
 */
const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

export default function CompeteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="compete-shell">
      <header className="cs-topbar">
        <div className="cs-topbar-in">
          <PlayWordmark variant="compete" href="/" size={25} className="cs-brand" />
          <nav className="cs-nav">
            <a href="/">Divisions</a>
            <a href={`${PLAY_URL}/schedule`}>Facility schedule</a>
          </nav>
          <a className="cs-toplay" href={`${PLAY_URL}/account`}>
            <span className="cs-toplay-lbl">Register &amp; manage</span>
            <span className="cs-toplay-mark">
              <span className="cs-toplay-play">Play</span><span className="cs-toplay-dot">.</span>
            </span>
          </a>
        </div>
      </header>

      <main className="cs-main">{children}</main>

      <footer className="cs-foot">
        <div className="cs-foot-in">
          <span className="label">Athlete Institute</span>
          <div className="cs-foot-links">
            <a href={`${PLAY_URL}/account`}>Play. Portal</a>
            <a href={`${PLAY_URL}/programs`}>Register</a>
            <a href={ECOSYSTEM_LINKS.hub}>All apps</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
