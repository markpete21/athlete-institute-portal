import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { ECOSYSTEM_LINKS } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';

/**
 * play.athleteinstitute.ca — public portal root, in the shared Vanguard design
 * system. Real surfaces (registration, rentals, schedules, catalog) arrive with
 * Modules 1+.
 */
export default async function PlayHome() {
  const session = await getPortalSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-4">
        <p className="label text-[11px]">play.athleteinstitute.ca</p>
        <h1 className="text-6xl">
          Athlete Institute<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="max-w-md text-lg text-body">
          Register for programs, book rentals, and see schedules — all in one
          place.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <SignedOut>
          <Link href="/sign-in" className="btn-gold">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn-ghost">
            Create account
          </Link>
        </SignedOut>
        <SignedIn>
          <UserButton />
          <span className="text-sm text-body">
            {session.email}
            {session.isStaff && <span className="tag ml-2">staff</span>}
          </span>
          {session.isStaff && (
            <a href={process.env.NEXT_PUBLIC_ADMIN_URL ?? '#'} className="btn-ghost btn-sm">
              Admin →
            </a>
          )}
        </SignedIn>
      </div>

      <nav className="flex gap-5 border-t border-hairline pt-6 font-mono text-[11px] uppercase tracking-[0.14em]">
        <a href={ECOSYSTEM_LINKS.hub} className="text-silver hover:text-ink">Apps</a>
        <a href={ECOSYSTEM_LINKS.live} className="text-silver hover:text-ink">Live</a>
        <a href={ECOSYSTEM_LINKS.tickets} className="text-silver hover:text-ink">Tickets</a>
        <Link href="/brands" className="text-silver hover:text-ink">Brands</Link>
      </nav>
    </main>
  );
}
