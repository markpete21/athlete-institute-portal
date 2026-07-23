import { notFound } from 'next/navigation';
import { getRentalByToken } from '@/lib/rentals/quotes';
import { getWaiver, signatureFor } from '@/lib/waivers';
import { signRentalWaiverAction } from './actions';

export const dynamic = 'force-dynamic';

/** Public waiver signing page for a rental (reached from the quote link). */
export default async function SignWaiverPage({ params }: { params: { token: string } }) {
  const rental = await getRentalByToken(params.token);
  if (!rental) notFound();
  if (!rental.waiver_id) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-6">
        <h1 className="text-3xl">No waiver required<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">This rental has no waiver attached.</p>
      </main>
    );
  }

  const [waiver, existing] = await Promise.all([
    getWaiver(rental.waiver_id),
    signatureFor('rental', rental.id, rental.waiver_id),
  ]);
  const signedCurrent = existing && waiver && existing.waiver_version === waiver.version;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">{rental.title} · Waiver</p>
        <h1 className="text-4xl">{waiver?.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      <div className="card whitespace-pre-wrap p-6 text-sm leading-relaxed text-body">{waiver?.body}</div>

      {signedCurrent ? (
        <div className="card p-5">
          <p className="font-bold text-ink">Signed ✓</p>
          <p className="text-sm text-body">
            Signed by {existing!.signer_name} on{' '}
            {new Date(existing!.signed_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'long' })}.
          </p>
        </div>
      ) : (
        <form action={signRentalWaiverAction} className="card flex flex-col gap-4 p-6">
          <input type="hidden" name="token" value={params.token} />
          <label className="flex items-start gap-2 text-sm text-body">
            <input type="checkbox" name="agree" required className="mt-1" />
            I have read and agree to the waiver terms above, on behalf of the group I represent.
          </label>
          <div>
            <label className="field-label" htmlFor="sig">Type your full name to sign</label>
            <input id="sig" name="signatureText" required placeholder="Full name" className="input max-w-sm" />
          </div>
          <button type="submit" className="btn-gold self-start">Sign waiver</button>
        </form>
      )}
    </main>
  );
}
