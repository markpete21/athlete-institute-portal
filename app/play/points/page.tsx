import Link from 'next/link';
import { formatCAD as money } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { pointsSurface } from '@/lib/points/points';

export const dynamic = 'force-dynamic';

/** Family Play Points surface (Module 19), mobile-first. */
export default async function PointsPage() {
  const session = await getPortalSession();
  const surface = session.familyId ? await pointsSurface(session.familyId) : null;
  const shareUrl = surface ? `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/sign-up?ref=${surface.referralCode}` : '';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Play Points</p>
        <h1 className="text-4xl">Your points<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {!session.userId ? (
        <p className="text-body">Please <Link href="/sign-in" className="underline">sign in</Link> to see your points.</p>
      ) : !surface ? (
        <p className="text-body">Set up your household in <Link href="/account" className="underline">your account</Link> to start earning.</p>
      ) : (
        <>
          <div className="card flex items-baseline justify-between p-5">
            <span className="text-4xl text-ink">{surface.balance.toLocaleString()}</span>
            <span className="text-body">points ≈ {money(surface.balance)}</span>
          </div>

          <section className="card flex flex-col gap-2 p-4">
            <p className="field-label">Refer a friend</p>
            <p className="text-sm text-body">You get <b>1,000 points</b>, they get <b>500</b> — when they make their first registration. {surface.referralsThisSeason}/{surface.referralCap} used this season.</p>
            <input readOnly value={shareUrl} className="input w-full text-xs" onFocus={undefined} />
          </section>

          <section className="card flex flex-col gap-1 p-4">
            <p className="field-label">Loyalty ladder</p>
            <p className="text-sm text-body">{surface.loyaltySeasons} season{surface.loyaltySeasons === 1 ? '' : 's'} with us.
              {surface.nextMilestone ? ` Next: ${surface.nextMilestone.points} points at ${surface.nextMilestone.seasons} seasons.` : ' You have hit every milestone — thank you!'}</p>
          </section>

          <section className="flex flex-col gap-2">
            <p className="field-label">History</p>
            {surface.ledger.map((l, i) => (
              <div key={i} className="card flex items-center justify-between p-3 text-sm">
                <span className="text-body">{l.reason}</span>
                <span className={`mono ${l.delta > 0 ? 'text-[#3f7a5b]' : 'text-[#b4483c]'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</span>
              </div>
            ))}
            {surface.ledger.length === 0 && <p className="text-sm text-body">No activity yet.</p>}
          </section>

          <p className="text-xs text-silver">{surface.disclaimer}</p>
        </>
      )}
    </main>
  );
}
