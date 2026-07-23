import Link from 'next/link';
import { getPortalSession } from '@/lib/auth';
import { requestRentalAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Rental request (Module 3 Stage 7): org agents and customers describe what
 * they need; staff build the quote. Organizations always go through staff for
 * a quote (no org self-serve booking).
 */
export default async function RentalRequestPage({ searchParams }: { searchParams: { sent?: string } }) {
  const session = await getPortalSession();

  if (searchParams.sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
        <h1 className="text-4xl">Request received<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">Our team will build your quote and email it to you shortly.</p>
        <Link href="/" className="btn-ghost btn-sm self-start">Back to portal</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Rentals</p>
        <h1 className="text-5xl">Request a rental<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">
          Tell us what you need and our team will prepare a quote. A deposit is
          required to confirm any booking.
        </p>
      </header>

      {!session.userId ? (
        <div className="card p-6">
          <p className="text-body">Please <Link href="/sign-in" className="text-gold">sign in</Link> to request a rental.</p>
        </div>
      ) : (
        <form action={requestRentalAction} className="card flex flex-col gap-4 p-6">
          <div>
            <label className="field-label" htmlFor="orgName">Organization (if any)</label>
            <input id="orgName" name="orgName" placeholder="e.g. XYZ Basketball Club" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="desired">Dates &amp; spaces you need</label>
            <textarea id="desired" name="desired" required rows={3} placeholder="e.g. Dome Court 1, Saturdays 9am–12pm through March" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="notes">Anything else</label>
            <textarea id="notes" name="notes" rows={2} className="input" />
          </div>
          <button type="submit" className="btn-gold self-start">Send request</button>
        </form>
      )}
    </main>
  );
}
