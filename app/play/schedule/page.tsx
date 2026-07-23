import { getPortalSession } from '@/lib/auth';

/**
 * Read-only facility schedule — the ONLY page tenants can reach on play.*.
 * Module 2 replaces this placeholder with the real schedule views (built on
 * the WeekGridShell/DayColumnShell primitives from the UI kit).
 */
export default async function SchedulePage() {
  const session = await getPortalSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="label text-[11px]">Facility schedule · read-only</p>
      <h1 className="text-5xl">
        Schedule<span style={{ color: 'var(--accent)' }}>.</span>
      </h1>
      <p className="text-body">
        The live facility schedule arrives with Module 2.
        {session.userType === 'tenant' && (
          <> As a tenant, this schedule view is your home on the portal.</>
        )}
      </p>
    </main>
  );
}
