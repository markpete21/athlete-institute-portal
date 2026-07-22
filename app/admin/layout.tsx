import { redirect } from 'next/navigation';
import { ECOSYSTEM_LINKS } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';

/**
 * Hard staff-only gate for admin.* (Module 1 §Auth: "Non-staff accounts are
 * fully blocked from admin — no limited view, hard redirect to play").
 *
 * Middleware already guaranteed a signed-in session; here we have the full user
 * and enforce the staff/role check. Non-staff bounce to the public portal.
 * (Local dev shares one origin, so the redirect points at the play host only in
 * production; on localhost a non-staff user lands on the play tree root.)
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();

  if (!session.isStaff) {
    const playUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? ECOSYSTEM_LINKS.hub;
    redirect(playUrl);
  }

  return <>{children}</>;
}
