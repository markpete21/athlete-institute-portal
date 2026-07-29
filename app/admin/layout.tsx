import { redirect } from 'next/navigation';
import { ECOSYSTEM_LINKS } from '@ai/foundation';
import AdminShell from '@/components/nav/AdminShell';
import { getPortalSession } from '@/lib/auth';
import { getNavPrefs, pinnablePrograms, pinnedProgramStats } from '@/lib/nav/prefs';
import { setRailMinimizedAction, toggleFavouriteAction, togglePinnedProgramAction } from './nav-actions';

export const dynamic = 'force-dynamic';

/**
 * Hard staff-only gate for admin.* (Module 1 §Auth: "Non-staff accounts are
 * fully blocked from admin — no limited view, hard redirect to play"), plus the
 * persistent AdminShell chrome that wraps every admin screen.
 *
 * Middleware already guaranteed a signed-in session; here we have the full user
 * and enforce the staff/role check. Non-staff bounce to the public portal.
 * (Local dev shares one origin, so the redirect points at the play host only in
 * production; on localhost a non-staff user lands on the play tree root.)
 */
const STATS_DAYS = 7; // pinned-program key stats default to the last 7 days

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();

  if (!session.isStaff) {
    const playUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? ECOSYSTEM_LINKS.hub;
    redirect(playUrl);
  }

  const prefs = await getNavPrefs(session.profileId);
  const [pinnedStats, programs] = await Promise.all([
    pinnedProgramStats(prefs.pinnedPrograms, STATS_DAYS),
    pinnablePrograms(),
  ]);

  return (
    <AdminShell
      email={session.email}
      roleLabel={session.roles.length ? session.roles.join(', ') : session.userType}
      favourites={prefs.favourites}
      railMinimized={prefs.railMinimized}
      pinnedStats={pinnedStats}
      statsDays={STATS_DAYS}
      pinnablePrograms={programs}
      pinnedProgramIds={prefs.pinnedPrograms}
      onToggleFavourite={toggleFavouriteAction}
      onTogglePinnedProgram={togglePinnedProgramAction}
      onSetRailMinimized={setRailMinimizedAction}
    >
      {children}
    </AdminShell>
  );
}
