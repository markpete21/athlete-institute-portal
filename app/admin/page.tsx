import { UserButton } from '@clerk/nextjs';
import { getPortalSession } from '@/lib/auth';

/**
 * admin.athleteinstitute.ca — staff backend root.
 * Reaching this means the middleware confirmed a session AND the admin layout
 * confirmed staff access. Module 1 fills in real admin surfaces + role scoping.
 */
export default async function AdminHome() {
  const session = await getPortalSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-silver">
        admin.athleteinstitute.ca
      </p>
      <h1 className="text-4xl font-bold">
        Staff backend<span className="text-gold">.</span>
      </h1>
      <div className="flex items-center gap-3">
        <UserButton />
        <p className="text-silver">
          {session.email} ·{' '}
          <span className="text-gold">
            {session.roles.length ? session.roles.join(', ') : session.userType}
          </span>
        </p>
      </div>
      <p className="text-silver">
        Staff-only. Role scoping + admin modules arrive with Module 1. Module 0 ·
        Stage 2.
      </p>
    </main>
  );
}
