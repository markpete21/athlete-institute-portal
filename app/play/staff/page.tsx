import Link from 'next/link';
import { getPortalSession } from '@/lib/auth';
import { staffForProfile, staffSelfView } from '@/lib/staff/staff';
import { StaffSelfViewBody } from '@/components/play/StaffSelfViewBody';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My staff view — Play' };

/**
 * Staff self-view (Module 5 Stage 4): a coach/convenor's own READ-ONLY view of
 * their assigned programs' roster + schedule, capability-gated by the
 * permission matrix, plus date-unavailability submission. Mobile-first - this
 * is the page a coach opens courtside.
 */
export default async function StaffSelfViewPage() {
  const session = await getPortalSession();
  const staff = session.profileId ? await staffForProfile(session.profileId) : null;

  if (!staff) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-4xl">Staff view<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">
          {session.profileId
            ? 'No staff record is linked to this account. If you coach with us, ask the office to add your email to your staff record.'
            : 'Sign in with your staff email to see your programs, rosters, and schedule.'}
        </p>
        <Link href="/account" className="btn-ghost btn-sm self-start">← My account</Link>
      </main>
    );
  }

  const view = await staffSelfView(staff);
  return <StaffSelfViewBody staff={staff} {...view} />;
}
