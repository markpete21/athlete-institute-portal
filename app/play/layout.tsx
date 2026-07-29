import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatCAD, tenantAllowedPath } from '@ai/foundation';
import PlayShell, { type StatusItem } from '@/components/nav/PlayShell';
import { getPortalSession } from '@/lib/auth';
import { accountView } from '@/lib/play/account';
import { brandTiles } from '@/lib/play/brands';

export const dynamic = 'force-dynamic';

/**
 * play.* gate (Module 1 §User Types): tenants get ONLY the read-only facility
 * schedule — no booking, no registration. Everyone else passes through.
 *
 * Wraps the public tree in the PlayShell chrome: dark header with the brand logo
 * tiles, nav, and the fixed bottom status bar. The three status blocks are
 * omitted when their value is zero, so an empty balance never shows "$0.00".
 */
export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  const path = headers().get('x-portal-path') ?? '/';

  if (session.userType === 'tenant' && !tenantAllowedPath(path)) redirect('/schedule');

  const [brands, view] = await Promise.all([
    brandTiles(),
    session.familyId ? accountView(session.familyId, 14) : Promise.resolve(null),
  ]);

  // --- the three key numbers (zero values are omitted entirely) -------------
  const status: StatusItem[] = [];
  if (view) {
    if (view.points.balance > 0) {
      status.push({ icon: 'points', value: view.points.balance.toLocaleString('en-CA'), label: 'Play Points', tip: 'Works across all apps' });
    }
    if (view.balance.creditCents > 0) {
      status.push({ icon: 'credit', value: formatCAD(view.balance.creditCents), label: 'Credit', tip: 'Available at checkout' });
    }
    const nextDay = view.days.find((d) => d.sessions.length > 0);
    const nextSession = nextDay?.sessions[0];
    if (nextDay && nextSession) {
      const who = view.members.find((m) => m.id === nextSession.memberId);
      const time = new Date(nextSession.startsAt).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
      status.push({
        icon: 'cal',
        value: `${nextDay.weekday} ${time}`,
        name: [who?.name, nextSession.title].filter(Boolean).join(' · '),
        tip: `Next session${nextSession.facility ? ` · ${nextSession.facility}` : ''}`,
      });
    }
  }

  const initials = session.email ? session.email.slice(0, 2).toUpperCase() : null;

  return (
    <PlayShell brands={brands} status={status} signedIn={!!session.userId} initials={initials}>
      {children}
    </PlayShell>
  );
}
