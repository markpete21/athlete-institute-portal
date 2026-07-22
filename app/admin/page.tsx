import { UserButton } from '@clerk/nextjs';
import { getPortalSession } from '@/lib/auth';

/**
 * admin.athleteinstitute.ca — staff backend root, shared Vanguard design system.
 * Reaching this means middleware confirmed a session AND the admin layout
 * confirmed staff access. Module 1 fills in real admin surfaces + role scoping.
 */
export default async function AdminHome() {
  const session = await getPortalSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-4">
        <p className="label text-[11px]">admin.athleteinstitute.ca</p>
        <h1 className="text-6xl">
          Staff backend<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
      </div>

      <div className="card flex items-center gap-3 p-4">
        <UserButton />
        <div className="flex flex-col">
          <span className="text-sm text-ink">{session.email}</span>
          <span className="label text-[11px]">
            {session.roles.length ? session.roles.join(', ') : session.userType}
          </span>
        </div>
      </div>

      <p className="text-body">
        Staff-only. Role scoping and admin modules arrive with Module 1.
      </p>
    </main>
  );
}
