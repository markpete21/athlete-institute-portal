import { notFound } from 'next/navigation';
import { formatCAD as money } from '@ai/foundation';
import { getOfferByToken } from '@/lib/academy/academy';
import { respondAcademyOfferAction } from './actions';

export const dynamic = 'force-dynamic';

const TIER_LABEL: Record<string, string> = { room_board: 'Room & Board', commuter: 'Commuter', international: 'International' };

/**
 * Public Academy enrollment offer (Module 12 Stage 2/5), mobile-first. Shows the
 * tuition tier, scholarship, deposit, and remaining balance; parent accepts
 * (deposit applied toward tuition, balance on the payment plan) or declines.
 */
export default async function AcademyOfferPage({ params }: { params: { token: string } }) {
  const offer = await getOfferByToken(params.token);
  if (!offer) notFound();
  const done = offer.status !== 'pending';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-12">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Academy enrollment offer</p>
        <h1 className="text-3xl">{offer.teamName}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      <p className="text-body"><span className="font-bold text-ink">{offer.playerName}</span> has been offered a place with <span className="font-bold text-ink">{offer.teamName}</span>.</p>

      <div className="card flex flex-col gap-2 p-4 text-sm">
        <div className="flex justify-between"><span className="text-silver">Tuition ({TIER_LABEL[offer.tuitionTier]})</span><span>{money(offer.tuitionCents)}</span></div>
        {offer.scholarshipCents > 0 && <div className="flex justify-between"><span className="text-silver">Scholarship</span><span>−{money(offer.scholarshipCents)}</span></div>}
        <div className="flex justify-between border-t border-hairline pt-1"><span className="text-silver">Net tuition</span><span className="font-bold text-ink">{money(offer.netTuitionCents)}</span></div>
        <div className="flex justify-between"><span className="text-silver">Deposit to secure spot</span><span className="font-bold text-ink">{money(offer.depositCents)}</span></div>
        <div className="flex justify-between"><span className="text-silver">Balance (payment plan)</span><span>{money(offer.remainingCents)}</span></div>
        <p className="pt-1 text-xs text-silver">Your deposit applies toward tuition. Connect PAD (bank debit) to avoid the card processing fee. Tuition is a full-year commitment.</p>
      </div>

      {done ? (
        <p className="card p-4 text-center text-ink">This offer is <span className="font-bold capitalize">{offer.status}</span>.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <form action={respondAcademyOfferAction}>
            <input type="hidden" name="token" value={params.token} /><input type="hidden" name="accept" value="yes" />
            <button className="btn-gold w-full">Accept &amp; pay {money(offer.depositCents)} deposit</button>
          </form>
          <form action={respondAcademyOfferAction}>
            <input type="hidden" name="token" value={params.token} /><input type="hidden" name="accept" value="no" />
            <button className="btn-ghost w-full">Decline</button>
          </form>
        </div>
      )}
    </main>
  );
}
