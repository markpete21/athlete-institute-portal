import { notFound } from 'next/navigation';
import { formatCAD as money } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { dashboard } from '@/lib/academy/academy';
import { createTeamAction, respondAction, scholarshipAction, sendOfferAction } from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string | undefined> = { selected: '#9E8959', offered: '#9E8959', accepted: '#3f7a5b', declined: '#b4483c' };

/** Admin: one academy - named teams, recruitment pipeline, scholarships, dashboard. */
export default async function AcademyDetailPage({ params }: { params: { id: string } }) {
  const academyId = Number(params.id);
  const db = supabaseAdmin();
  const { data: academy } = await db.from('academies').select('id, name, processing_fee_percent, plan_complete_by').eq('id', academyId).maybeSingle();
  if (!academy) notFound();

  const [{ data: teams }, { data: players }, { data: offers }, dash] = await Promise.all([
    db.from('academy_teams').select('id, name, tuition_room_board_cents, tuition_commuter_cents, tuition_international_cents, capacity').eq('academy_id', academyId).order('name'),
    db.from('academy_players').select('id, team_id, status, scholarship_cents, tuition_tier, family_members(first_name, last_name)').eq('academy_id', academyId).order('id'),
    db.from('academy_offers').select('id, player_id, status').eq('status', 'pending'),
    dashboard(academyId),
  ]);
  const pendingByPlayer = new Map((offers ?? []).map((o) => [o.player_id, o]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Academy · fee {String(academy.processing_fee_percent)}% (waived on PAD)</p>
        <h1 className="text-3xl">{academy.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      {/* Dashboard */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3"><p className="label text-[10px]">Accepted</p><p className="text-2xl">{dash.acceptedCount}</p></div>
        <div className="card p-3"><p className="label text-[10px]">In pipeline</p><p className="text-2xl">{Object.values(dash.pipelineByStatus).reduce((a, b) => a + b, 0)}</p></div>
        <div className="card p-3"><p className="label text-[10px]">Scholarships</p><p className="text-2xl">{money(dash.scholarshipTotalCents)}</p></div>
        <div className="card p-3"><p className="label text-[10px]">Plan by</p><p className="text-2xl">{academy.plan_complete_by ?? 'Feb 1'}</p></div>
      </section>

      {/* Teams */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Teams</h2>
        {(teams ?? []).map((t) => (
          <div key={t.id} className="card flex items-center justify-between p-3 text-sm">
            <span className="font-bold text-ink">{t.name}</span>
            <span className="text-silver">R&amp;B {money(t.tuition_room_board_cents)} · Commuter {money(t.tuition_commuter_cents)} · Intl {money(t.tuition_international_cents)}</span>
          </div>
        ))}
        <form action={createTeamAction} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="academyId" value={academyId} />
          <div className="grow"><label className="field-label">Team name</label><input name="name" required placeholder="OP National Boys" className="input w-full text-sm" /></div>
          <div><label className="field-label">Room &amp; Board $</label><input name="roomBoard" type="number" min="0" step="0.01" className="input w-28 text-sm" /></div>
          <div><label className="field-label">Commuter $</label><input name="commuter" type="number" min="0" step="0.01" className="input w-28 text-sm" /></div>
          <div><label className="field-label">International $</label><input name="international" type="number" min="0" step="0.01" className="input w-28 text-sm" /></div>
          <button className="btn-gold btn-sm">Add team</button>
        </form>
      </section>

      {/* Pipeline */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Recruitment pipeline</h2>
        {(players ?? []).length === 0 && <p className="text-body text-sm">No players in the pipeline. Place accounts onto a team to start.</p>}
        {(players ?? []).map((p) => {
          const m = p.family_members as unknown as { first_name: string; last_name: string };
          const pending = pendingByPlayer.get(p.id);
          const teamName = (teams ?? []).find((t) => t.id === p.team_id)?.name ?? '—';
          return (
            <div key={p.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-bold text-ink">{m.first_name} {m.last_name}</span>
              <span className="text-silver">{teamName}</span>
              <span className="tag" style={{ color: STATUS_COLOR[p.status], borderColor: STATUS_COLOR[p.status] }}>{p.status}</span>
              {p.scholarship_cents > 0 && <span className="tag">schol {money(p.scholarship_cents)}</span>}
              <form action={scholarshipAction} className="flex items-center gap-1">
                <input type="hidden" name="academyId" value={academyId} /><input type="hidden" name="playerId" value={p.id} />
                <input name="scholarship" type="number" min="0" step="0.01" defaultValue={p.scholarship_cents / 100 || ''} placeholder="schol $" className="input w-24" />
                <button className="btn-ghost btn-sm">Set</button>
              </form>
              {pending ? (
                <div className="flex gap-1">
                  <form action={respondAction}><input type="hidden" name="academyId" value={academyId} /><input type="hidden" name="offerId" value={pending.id} /><input type="hidden" name="accept" value="yes" /><button className="btn-ghost btn-sm">Mark accepted</button></form>
                  <form action={respondAction}><input type="hidden" name="academyId" value={academyId} /><input type="hidden" name="offerId" value={pending.id} /><input type="hidden" name="accept" value="no" /><button className="btn-ghost btn-sm">Mark declined</button></form>
                </div>
              ) : p.status === 'selected' && (
                <form action={sendOfferAction} className="flex items-center gap-1">
                  <input type="hidden" name="academyId" value={academyId} /><input type="hidden" name="playerId" value={p.id} /><input type="hidden" name="teamId" value={p.team_id ?? ''} />
                  <select name="tuitionTier" className="input"><option value="room_board">Room &amp; Board</option><option value="commuter">Commuter</option><option value="international">International</option></select>
                  <input name="depositPct" type="number" min="1" max="100" placeholder="dep %" className="input w-16" />
                  <button className="btn-gold btn-sm">Send offer</button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      {dash.scholarshipsByPlayer.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl">Scholarships awarded</h2>
          {dash.scholarshipsByPlayer.map((s) => (
            <div key={s.playerId} className="card flex items-center justify-between p-3 text-sm"><span className="text-ink">{s.name}</span><span>{money(s.scholarshipCents)}</span></div>
          ))}
        </section>
      )}
    </main>
  );
}
