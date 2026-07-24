import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { scoreboard } from '@/lib/promotions/promotions';
import { closeContestAction, createChallengeAction, createContestAction } from './actions';

export const dynamic = 'force-dynamic';

/** Admin: Promotions (Module 20) - contests, challenges, wheel + points grants. */
export default async function PromotionsPage() {
  const db = supabaseAdmin();
  const [{ data: contests }, { data: challenges }] = await Promise.all([
    db.from('contests').select('id, name, game_key, status, starts_at, ends_at, reward_top_n, reward_points').order('id', { ascending: false }).limit(10),
    db.from('challenges').select('id, name, kind, points, status, ends_at').order('id', { ascending: false }).limit(10),
  ]);
  const boards = new Map<number, Array<{ familyId: number; best: number }>>();
  for (const c of contests ?? []) if (c.status !== 'awarded') boards.set(c.id, (await scoreboard(c.id)).slice(0, 5));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between border-b border-hairline pb-4">
        <div><p className="label text-[11px]">Promotions &amp; Engagement</p><h1 className="text-3xl">Promotions<span style={{ color: 'var(--accent)' }}>.</span></h1></div>
        <Link href="/points" className="btn-ghost btn-sm">Points &amp; grants →</Link>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Contests</h2>
        {(contests ?? []).map((c) => (
          <div key={c.id} className="card flex flex-col gap-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink">{c.name} <span className="text-silver">· {c.game_key}</span></span>
              <span className="flex items-center gap-2">
                <span className="tag">top {c.reward_top_n} × {c.reward_points}</span>
                <span className="tag">{c.status}</span>
                {c.status !== 'awarded' && <form action={closeContestAction}><input type="hidden" name="contestId" value={c.id} /><button className="btn-ghost btn-sm">Close &amp; award</button></form>}
              </span>
            </div>
            {boards.get(c.id)?.length ? (
              <div className="text-xs text-body">Board (staff-only): {boards.get(c.id)!.map((b, i) => `${i + 1}. fam ${b.familyId} — ${b.best}`).join(' · ')}</div>
            ) : null}
          </div>
        ))}
        <form action={createContestAction} className="card flex flex-wrap items-end gap-2 p-4">
          <div className="grow"><label className="field-label">Name</label><input name="name" required placeholder="24-Hour Hoops Blitz" className="input w-full text-sm" /></div>
          <div><label className="field-label">Game</label><select name="gameKey" className="input text-sm"><option>basketball</option><option>soccer</option><option>volleyball</option><option>pickleball</option><option>football</option></select></div>
          <div><label className="field-label">Starts</label><input name="startsAt" type="datetime-local" required className="input text-sm" /></div>
          <div><label className="field-label">Ends</label><input name="endsAt" type="datetime-local" required className="input text-sm" /></div>
          <div><label className="field-label">Top N</label><input name="topN" type="number" min="1" defaultValue="5" className="input w-16 text-sm" /></div>
          <div><label className="field-label">Points</label><input name="points" type="number" min="0" defaultValue="2500" className="input w-24 text-sm" /></div>
          <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" name="announce" defaultChecked /> Announce</label>
          <button className="btn-gold btn-sm">Create contest</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Challenges</h2>
        {(challenges ?? []).map((c) => (
          <div key={c.id} className="card flex items-center justify-between p-3 text-sm">
            <span className="text-ink">{c.name} <span className="text-silver">· {c.kind}</span></span>
            <span className="tag">{c.points} pts · {c.status}</span>
          </div>
        ))}
        <form action={createChallengeAction} className="card flex flex-wrap items-end gap-2 p-4">
          <div className="grow"><label className="field-label">Name</label><input name="name" required placeholder="First 20 to register for summer camp" className="input w-full text-sm" /></div>
          <div><label className="field-label">Type</label><select name="kind" className="input text-sm"><option value="first_n">First N to act</option><option value="do_x_by_date">Do X by date</option><option value="streak">Streak bonus</option><option value="referral_push">Referral push</option></select></div>
          <div><label className="field-label">N</label><input name="n" type="number" min="1" defaultValue="20" className="input w-16 text-sm" /></div>
          <div><label className="field-label">Count</label><input name="count" type="number" min="1" defaultValue="3" className="input w-16 text-sm" /></div>
          <div><label className="field-label">Points</label><input name="points" type="number" min="0" defaultValue="1000" className="input w-24 text-sm" /></div>
          <div><label className="field-label">Ends</label><input name="endsAt" type="datetime-local" className="input text-sm" /></div>
          <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" name="announce" /> Announce</label>
          <button className="btn-gold btn-sm">Create challenge</button>
        </form>
        <p className="text-xs text-silver">Wheel odds + unlock live in the wheel_config table; games rotate per contest. No public leaderboards — boards above are staff-only.</p>
      </section>
    </main>
  );
}
