import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { familyBadges, lifetimeEarned, seasonStreak, wheelConfig } from '@/lib/promotions/promotions';
import SportGame from './game';
import SpinWheel from './wheel';

export const dynamic = 'force-dynamic';

/** The Arcade (Module 20): live contests + games, the wheel, streaks & badges. */
export default async function ArcadePage() {
  const session = await getPortalSession();
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: contests } = await db.from('contests').select('id, name, game_key, ends_at, reward_top_n, reward_points').eq('status', 'open').lte('starts_at', now).gte('ends_at', now).order('ends_at');

  let wheel: { locked: boolean; needed: number } = { locked: true, needed: 0 };
  let streak = 0;
  let badges: Array<{ key: string; label: string; description: string | null }> = [];
  if (session.familyId) {
    const [cfg, earned] = await Promise.all([wheelConfig(), lifetimeEarned(session.familyId)]);
    wheel = { locked: earned < cfg.unlockLifetimePoints, needed: Math.max(0, cfg.unlockLifetimePoints - earned) };
    [streak, badges] = await Promise.all([seasonStreak(session.familyId), familyBadges(session.familyId)]);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">The Arcade</p>
        <h1 className="text-4xl">Play &amp; win<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {!session.userId ? (
        <p className="text-body">Please <Link href="/sign-in" className="underline">sign in</Link> to play.</p>
      ) : (
        <>
          {streak >= 2 && (
            <div className="card border-l-2 border-[var(--accent)] p-4 text-sm text-body">
              🔥 You&apos;ve registered <b>{streak} seasons running</b> — keep the streak alive!
            </div>
          )}

          {(contests ?? []).length === 0 && <p className="text-body text-sm">No live contests right now — check back soon.</p>}
          {(contests ?? []).map((c) => (
            <section key={c.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xl">{c.name}</h2>
                <span className="tag">top {c.reward_top_n} win {c.reward_points.toLocaleString()} pts</span>
              </div>
              <SportGame contestId={c.id} gameKey={c.game_key} />
              <p className="text-xs text-silver">Ends {new Date(c.ends_at).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}</p>
            </section>
          ))}

          <section className="flex flex-col gap-2">
            <h2 className="text-xl">Spin to win</h2>
            <SpinWheel locked={wheel.locked} needed={wheel.needed} />
          </section>

          {badges.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xl">Your badges</h2>
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => <span key={b.key} className="tag" title={b.description ?? ''}>🏅 {b.label}</span>)}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
