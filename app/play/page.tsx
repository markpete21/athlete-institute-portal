import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { ECOSYSTEM_LINKS } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';

/**
 * play.athleteinstitute.ca — public portal root.
 * Stage-2 shows live auth state; real surfaces (registration, rentals,
 * schedules, catalog) arrive with Modules 1+.
 */
export default async function PlayHome() {
  const session = await getPortalSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-silver">
        play.athleteinstitute.ca
      </p>
      <h1 className="text-4xl font-bold">
        Athlete Institute<span className="text-gold">.</span>
      </h1>
      <p className="text-silver">
        Public portal — registration, rentals, schedules. Module 0 · Stage 2.
      </p>

      <div className="flex items-center gap-4 text-sm">
        <SignedOut>
          <Link href="/sign-in" className="rounded bg-gold px-4 py-2 font-medium text-ink">
            Sign in
          </Link>
          <Link href="/sign-up" className="text-gold">
            Create account
          </Link>
        </SignedOut>
        <SignedIn>
          <UserButton />
          <span className="text-silver">
            {session.email}
            {session.isStaff && (
              <> · <span className="text-gold">staff</span></>
            )}
          </span>
          {session.isStaff && (
            <a href={process.env.NEXT_PUBLIC_ADMIN_URL ?? '#'} className="text-gold">
              Admin →
            </a>
          )}
        </SignedIn>
      </div>

      <nav className="flex gap-4 text-sm text-gold">
        <a href={ECOSYSTEM_LINKS.hub}>Apps</a>
        <a href={ECOSYSTEM_LINKS.live}>Live</a>
        <a href={ECOSYSTEM_LINKS.tickets}>Tickets</a>
      </nav>
    </main>
  );
}
