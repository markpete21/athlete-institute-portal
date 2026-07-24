import { notFound } from 'next/navigation';
import { formatCAD as money } from '@ai/foundation';
import { getOfferByToken } from '@/lib/club/club';
import { respondOfferAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Public digital offer acceptance (Module 11 Stage 4), mobile-first. Parent
 * confirms (paying the deposit if required) or denies. Deposit applies toward
 * the season fee; the remaining balance runs on the Module 4 payment plan.
 */
export default async function OfferPage({ params }: { params: { token: string } }) {
  const offer = await getOfferByToken(params.token);
  if (!offer) notFound();

  const done = offer.status !== 'pending';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-12">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Team offer</p>
        <h1 className="text-3xl">{offer.teamName}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      <p className="text-body">
        <span className="font-bold text-ink">{offer.playerName}</span> has received an offer to join <span className="font-bold text-ink">{offer.teamName}</span>.
      </p>

      <div className="card flex flex-col gap-2 p-4 text-sm">
        <div className="flex justify-between"><span className="text-silver">Season fee</span><span>{money(offer.seasonFeeCents)}</span></div>
        {offer.mode === 'deposit' ? (
          <>
            <div className="flex justify-between"><span className="text-silver">Deposit to confirm</span><span className="font-bold text-ink">{money(offer.depositCents)}</span></div>
            <div className="flex justify-between"><span className="text-silver">Remaining (payment plan)</span><span>{money(offer.remainingCents)}</span></div>
            <p className="pt-1 text-xs text-silver">Your deposit applies toward the season fee — it is not an extra charge.</p>
          </>
        ) : (
          <p className="text-xs text-silver">This is a verbal-commitment offer — no payment is required to confirm.</p>
        )}
      </div>

      {done ? (
        <p className="card p-4 text-center text-ink">This offer is <span className="font-bold capitalize">{offer.status}</span>.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <form action={respondOfferAction}>
            <input type="hidden" name="token" value={params.token} />
            <input type="hidden" name="accept" value="yes" />
            <button className="btn-gold w-full">{offer.mode === 'deposit' ? `Confirm & pay ${money(offer.depositCents)} deposit` : 'Confirm my spot'}</button>
          </form>
          <form action={respondOfferAction}>
            <input type="hidden" name="token" value={params.token} />
            <input type="hidden" name="accept" value="no" />
            <button className="btn-ghost w-full">Decline</button>
          </form>
        </div>
      )}
    </main>
  );
}
