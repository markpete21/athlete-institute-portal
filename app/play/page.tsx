import { ECOSYSTEM_LINKS } from '@ai/foundation';

/**
 * play.athleteinstitute.ca — public portal root.
 * Stage-1 placeholder proving host→tree routing; real surfaces arrive with
 * Modules 1+ (registration, rentals, schedules, catalog).
 */
export default function PlayHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-silver">
        play.athleteinstitute.ca
      </p>
      <h1 className="text-4xl font-bold">
        Athlete Institute<span className="text-gold">.</span>
      </h1>
      <p className="text-silver">
        Public portal — registration, rentals, schedules. Module 0 · Stage 1
        skeleton.
      </p>
      <nav className="flex gap-4 text-sm text-gold">
        <a href={ECOSYSTEM_LINKS.hub}>Apps</a>
        <a href={ECOSYSTEM_LINKS.live}>Live</a>
        <a href={ECOSYSTEM_LINKS.tickets}>Tickets</a>
      </nav>
    </main>
  );
}
