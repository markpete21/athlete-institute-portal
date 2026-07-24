import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCAD as money } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { evaluationSheet, type Gender } from '@/lib/club/club';
import { addTryoutSessionAction, cancelOfferAction, createTeamAction, flagAction, saveEvalAction, sendOfferAction, syncRosterAction } from '../actions';

export const dynamic = 'force-dynamic';

const FLAG_COLOR: Record<string, string | undefined> = { selected: '#3f7a5b', considering: '#9E8959', out: '#b4483c', offered_pending: '#9E8959', confirmed: '#3f7a5b', declined: '#b4483c' };

/** Admin: one club - teams + tryout pipeline (consolidate, evaluate, flag, offer). */
export default async function ClubDetailPage({ params }: { params: { id: string } }) {
  const clubId = Number(params.id);
  const db = supabaseAdmin();
  const { data: club } = await db.from('clubs').select('id, name, sport').eq('id', clubId).maybeSingle();
  if (!club) notFound();

  const [{ data: teams }, { data: sessions }, { data: offers }] = await Promise.all([
    db.from('club_teams').select('id, name, level_label, gender, dob_min, dob_max, season_fee_cents').eq('club_id', clubId).order('name'),
    db.from('club_tryout_sessions').select('level_label, gender, programs(name)').eq('club_id', clubId),
    db.from('club_offers').select('id, player_id, status, mode').in('status', ['pending']),
  ]);

  // distinct level+gender groups from tryout sessions
  const groups = [...new Map((sessions ?? []).map((s) => [`${s.level_label}|${s.gender}`, { level: s.level_label, gender: s.gender as Gender }])).values()];
  const rosters = await Promise.all(groups.map((g) => evaluationSheet(clubId, g.level, g.gender)));
  const pendingByPlayer = new Map((offers ?? []).map((o) => [o.player_id, o]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Club{club.sport ? ` · ${club.sport}` : ''}</p>
        <h1 className="text-3xl">{club.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {/* Teams */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Teams</h2>
        {(teams ?? []).map((t) => (
          <div key={t.id} className="card flex items-center justify-between p-3">
            <span className="text-ink">{t.name} <span className="text-silver">· {t.level_label} {t.gender}</span></span>
            <span className="text-sm">{money(t.season_fee_cents)}{t.dob_min ? ` · DOB ${t.dob_min}→${t.dob_max}` : ''}</span>
          </div>
        ))}
        <form action={createTeamAction} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="clubId" value={clubId} />
          <div><label className="field-label">Team</label><input name="name" required placeholder="15U Girls" className="input text-sm" /></div>
          <div><label className="field-label">Level</label><input name="levelLabel" required placeholder="15U" className="input w-20 text-sm" /></div>
          <div><label className="field-label">Gender</label><select name="gender" className="input text-sm"><option value="girls">girls</option><option value="boys">boys</option><option value="mixed">mixed</option></select></div>
          <div><label className="field-label">DOB min</label><input name="dobMin" type="date" className="input text-sm" /></div>
          <div><label className="field-label">DOB max</label><input name="dobMax" type="date" className="input text-sm" /></div>
          <div><label className="field-label">Season $</label><input name="seasonFee" type="number" min="0" step="0.01" className="input w-24 text-sm" /></div>
          <button className="btn-gold btn-sm">Add team</button>
        </form>
      </section>

      {/* Tryout pipeline per level+gender group */}
      <section className="flex flex-col gap-5">
        <h2 className="text-xl">Tryout pipeline</h2>
        {groups.length === 0 && <p className="text-body text-sm">No tryout sessions linked yet. Link an existing tryout program below.</p>}
        {groups.map((g, gi) => (
          <div key={`${g.level}-${g.gender}`} className="flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-hairline pb-1">
              <h3 className="text-lg">{g.level} {g.gender}</h3>
              <div className="flex gap-2">
                <Link href={`/club/eval/${clubId}/${encodeURIComponent(g.level)}/${g.gender}`} className="btn-ghost btn-sm">Eval sheet (PDF)</Link>
                <form action={syncRosterAction}><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="levelLabel" value={g.level} /><input type="hidden" name="gender" value={g.gender} /><button className="btn-ghost btn-sm">Sync roster</button></form>
              </div>
            </div>
            {rosters[gi].length === 0 && <p className="text-body text-sm">No players — sync the roster after tryout registrations arrive.</p>}
            {rosters[gi].map((p) => {
              const pending = pendingByPlayer.get(p.playerId);
              return (
                <div key={p.playerId} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="mono text-silver">{p.number}</span>
                  <span className="font-bold text-ink">{p.name}</span>
                  <span className="tag" style={{ color: FLAG_COLOR[p.flag], borderColor: FLAG_COLOR[p.flag] }}>{p.flag.replace('_', ' ')}</span>
                  <form action={saveEvalAction} className="flex items-center gap-1">
                    <input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="playerId" value={p.playerId} />
                    <input name="rating" type="number" min="1" max="5" defaultValue={p.rating ?? ''} placeholder="1-5" className="input w-16" />
                    <input name="notes" defaultValue={p.notes ?? ''} placeholder="notes" className="input w-32" />
                    <button className="btn-ghost btn-sm">Save</button>
                  </form>
                  {['selected', 'considering', 'out'].map((f) => (
                    <form key={f} action={flagAction}><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="playerId" value={p.playerId} /><input type="hidden" name="flag" value={f} /><input type="hidden" name="teamId" value={(teams ?? []).find((t) => t.level_label === g.level && t.gender === g.gender)?.id ?? ''} /><button className="btn-ghost btn-sm capitalize">{f}</button></form>
                  ))}
                  {pending ? (
                    <form action={cancelOfferAction}><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="offerId" value={pending.id} /><button className="btn-ghost btn-sm">Cancel offer</button></form>
                  ) : p.flag === 'selected' && (
                    <form action={sendOfferAction} className="flex items-center gap-1">
                      <input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="playerId" value={p.playerId} /><input type="hidden" name="teamId" value={(teams ?? []).find((t) => t.level_label === g.level && t.gender === g.gender)?.id ?? ''} />
                      <select name="mode" className="input"><option value="verbal">verbal</option><option value="deposit">deposit</option></select>
                      <input name="depositPct" type="number" min="1" max="100" placeholder="%" className="input w-16" />
                      <button className="btn-gold btn-sm">Send offer</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <form action={addTryoutSessionAction} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="clubId" value={clubId} />
          <div><label className="field-label">Tryout program ID</label><input name="programId" type="number" required className="input w-32 text-sm" /></div>
          <div><label className="field-label">Level</label><input name="levelLabel" required placeholder="15U" className="input w-20 text-sm" /></div>
          <div><label className="field-label">Gender</label><select name="gender" className="input text-sm"><option value="girls">girls</option><option value="boys">boys</option><option value="mixed">mixed</option></select></div>
          <button className="btn-ghost btn-sm">Link tryout session</button>
        </form>
      </section>
    </main>
  );
}
