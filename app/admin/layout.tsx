import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ECOSYSTEM_LINKS } from '@ai/foundation';
import AdminShell from '@/components/nav/AdminShell';
import { capabilitiesForProfile } from '@/lib/access/capabilities';
import { getPortalSession } from '@/lib/auth';
import { MODULE_BY_KEY, activeModuleFor, visibleModules } from '@/lib/nav/modules';
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

  // Module gate: a module that declares a capability is invisible AND
  // unreachable without it (one rule for nav + pages; actions still gate
  // their own sensitive operations).
  const caps = session.profileId ? await capabilitiesForProfile(session.profileId) : {};
  const allowed = visibleModules(caps, session.bootstrapAdmin);
  const path = headers().get('x-portal-path') ?? '/';
  const active = activeModuleFor(path);
  if (active && MODULE_BY_KEY[active].capability && !allowed.some((m) => m.key === active)) redirect('/');

  const prefs = await getNavPrefs(session.profileId);
  const [pinnedStats, programs] = await Promise.all([
    pinnedProgramStats(prefs.pinnedPrograms.filter(Boolean), STATS_DAYS),
    pinnablePrograms(),
  ]);

  return (
    <AdminShell
      email={session.email}
      roleLabel={session.roles.length ? session.roles.join(', ') : session.userType}
      favourites={prefs.favourites.filter((k) => allowed.some((m) => m.key === k))}
      allowedModules={allowed.map((m) => m.key)}
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
