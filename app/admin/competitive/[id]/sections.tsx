import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { coachBoard } from '@/lib/competitive/coachConfirmations';
import { latestProposal } from '@/lib/competitive/draftProposals';
import { officialSchedules } from '@/lib/competitive/officials';
import {
  applyDraftAction,
  bookOfficialsAction,
  discardDraftAction,
  proposeDraftAction,
  remindCoachesAction,
  saveCoachQuestionsAction,
  sendCoachConfirmsAction,
  setTeamCoachAction,
} from '../actions';

/**
 * Division-page sections for the season automation flow (migration 0058).
 * Server components that fetch their own data so the page stays readable;
 * every mutation is a plain <form action={serverAction}> like the rest of
 * the admin.
 */

const STATUS_LABEL: Record<string, string> = {
  unassigned: 'No coach',
  not_sent: 'Not sent',
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

/* Stage 1: assign coaches, send one-tap confirmation emails, collect answers. */
export async function CoachSection({ divisionId }: { divisionId: number }) {
  const db = supabaseAdmin();
  const [{ rows, questions }, { data: staff }] = await Promise.all([
    coachBoard(divisionId),
    db.from('staff').select('id, first_name, last_name').eq('status', 'active').order('last_name'),
  ]);
  if (!rows.length) return null;
  const appUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl">Coaches</h2>
        <span className="label text-[10px]">
          {rows.filter((r) => r.status === 'confirmed').length}/{rows.length} confirmed
        </span>
      </div>
      <p className="text-body max-w-[62ch] text-sm">
        Assign a coach to each team, then send the confirmation emails - each coach gets a one-tap
        link (no login needed) plus your custom questions. Swapping a coach resets that team&apos;s
        confirmation.
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.teamId} className="flex flex-wrap items-center gap-2 border border-hairline p-2 text-sm">
            <span className="w-24 text-ink">{r.teamName}</span>
            <form action={setTeamCoachAction} className="flex items-center gap-2">
              <input type="hidden" name="divisionId" value={divisionId} />
              <input type="hidden" name="teamId" value={r.teamId} />
              <select name="staffId" defaultValue={r.staffId ?? ''} className="input w-44 text-sm">
                <option value="">TBD - decide later</option>
                {(staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
              <button type="submit" className="btn-ghost btn-sm">Set</button>
            </form>
            <span className={`tag ${r.status === 'confirmed' ? 'text-ink' : ''}`}>{STATUS_LABEL[r.status]}</span>
            {r.status === 'confirmed' && r.answers && Object.keys(r.answers).length > 0 && (
              <span className="text-silver text-xs">{Object.entries(r.answers).map(([q, a]) => `${q} ${a}`).join(' · ')}</span>
            )}
            {r.status === 'declined' && r.note && <span className="text-xs" style={{ color: '#a03030' }}>&ldquo;{r.note}&rdquo; - pick a replacement</span>}
            {r.status === 'pending' && !r.coachEmail && r.token && (
              <span className="text-silver text-xs">no email on staff record - share {appUrl}/coach-confirm/{r.token}</span>
            )}
          </div>
        ))}
      </div>

      <form action={saveCoachQuestionsAction} className="flex flex-col gap-2">
        <input type="hidden" name="divisionId" value={divisionId} />
        <label className="field-label" htmlFor="coach-questions">Custom questions on the confirm form (one per line)</label>
        <textarea id="coach-questions" name="questions" rows={2} defaultValue={questions.join('\n')} className="input text-sm" placeholder={'Preferred practice night?\nCan you attend the coaches meeting?'} />
        <div><button type="submit" className="btn-ghost btn-sm">Save questions</button></div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
        <form action={sendCoachConfirmsAction}>
          <input type="hidden" name="divisionId" value={divisionId} />
          <button type="submit" className="btn-gold btn-sm">Send confirmation emails</button>
        </form>
        {pending > 0 && (
          <form action={remindCoachesAction}>
            <input type="hidden" name="divisionId" value={divisionId} />
            <button type="submit" className="btn-ghost btn-sm">Remind pending ({pending})</button>
          </form>
        )}
        <span className="label text-[9px]">Already-confirmed coaches are never re-emailed. Declines show here with their note.</span>
      </div>
    </section>
  );
}

const ATTRS = ['skill', 'age', 'gender', 'experience', 'height'];

/* Stage 3: preview the balancing draft, then approve or discard. */
export async function DraftSection({ divisionId, teamCount }: { divisionId: number; teamCount: number }) {
  const proposal = await latestProposal(divisionId);
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-2xl">Team builder</h2>
      <p className="text-body max-w-[62ch] text-sm">
        Previews a balanced draft from staff skill ratings (and any other checked traits) around
        locked players and together-groups - nothing is saved until you approve. Skill comes from
        the 1-5 ratings below; age from date of birth.
      </p>
      <form action={proposeDraftAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="divisionId" value={divisionId} />
        <div><label className="field-label">Teams</label><input name="numTeams" type="number" defaultValue={Math.max(2, teamCount || 2)} min={2} className="input w-20" /></div>
        <div className="flex items-end gap-3">
          {ATTRS.map((a) => (
            <label key={a} className="flex items-center gap-1 font-mono text-[11px] uppercase text-silver">
              <input type="checkbox" name="attributes" value={a} defaultChecked={a === 'skill'} /> {a}
            </label>
          ))}
        </div>
        <button type="submit" className="btn-gold btn-sm">{proposal ? 'Regenerate preview' : 'Preview draft'}</button>
      </form>

      {proposal && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label text-[10px]">Proposed draft #{proposal.proposalId}</span>
            {Object.entries(proposal.spread).map(([k, v]) => (
              <span key={k} className="tag">{k} spread {typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {proposal.teams.map((t) => (
              <div key={t.name} className="border border-hairline p-3">
                <p className="label mb-1 text-[10px]">{t.name}{t.avgSkill != null ? ` · avg ${t.avgSkill.toFixed(2)}` : ''}</p>
                <ul className="flex flex-col gap-0.5">
                  {t.members.map((m) => (
                    <li key={m.memberId} className="flex items-center justify-between text-sm">
                      <span className="truncate text-ink">{m.name}</span>
                      <span className="mono text-xs text-silver">{m.rating ?? '-'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <form action={applyDraftAction}>
              <input type="hidden" name="proposalId" value={proposal.proposalId} />
              <button type="submit" className="btn-gold btn-sm">Approve &amp; assign teams</button>
            </form>
            <form action={discardDraftAction}>
              <input type="hidden" name="proposalId" value={proposal.proposalId} />
              <input type="hidden" name="divisionId" value={divisionId} />
              <button type="submit" className="btn-ghost btn-sm">Discard</button>
            </form>
            <span className="label text-[9px]">Approving points every roster row at its team - reusing existing team rows in order.</span>
          </div>
        </div>
      )}
    </section>
  );
}

/* Step after scheduling: book officials onto every game + condensed schedules. */
export async function OfficialsSection({ divisionId }: { divisionId: number }) {
  const db = supabaseAdmin();
  const [{ data: games }, { schedules, assignmentsByGame }] = await Promise.all([
    db.from('games').select('id').eq('division_id', divisionId).not('starts_at', 'is', null),
    officialSchedules(divisionId),
  ]);
  const scheduled = (games ?? []).length;
  if (!scheduled) return null;
  const unassigned = (games ?? []).filter((g) => !(assignmentsByGame.get(g.id)?.length)).length;

  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl">Officials</h2>
        <Link href={`/competitive/${divisionId}/officials`} className="label text-[11px] hover:text-ink">Condensed schedules →</Link>
      </div>
      <p className="text-body max-w-[62ch] text-sm">
        Auto-assigns the pool to every scheduled game: inside each official&apos;s availability window,
        never two courts at once, never over their daily cap, and never a game whose team they coach.
        Games the rules can&apos;t fill are flagged, not silently short-staffed.
      </p>
      <form action={bookOfficialsAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="divisionId" value={divisionId} />
        <div>
          <label className="field-label">Per game</label>
          <select name="perGame" defaultValue="2" className="input w-20 text-sm"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
        </div>
        <button type="submit" className="btn-gold btn-sm">Book officials</button>
        <span className="label text-[10px]">
          {schedules.length
            ? `${schedules.reduce((n, s) => n + s.lines.length, 0)} assignments across ${schedules.length} officials${unassigned ? ` · ${unassigned} game${unassigned === 1 ? '' : 's'} unstaffed` : ''}`
            : `${scheduled} scheduled games · nothing booked yet`}
        </span>
        <Link href="/competitive/officials" className="label ml-auto text-[10px] hover:text-ink">Manage pool →</Link>
      </form>
      {schedules.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schedules.map((s) => (
            <div key={s.official.id} className="border border-hairline p-3">
              <p className="label mb-1 text-[10px]">{s.official.firstName} {s.official.lastName} · {s.lines.length} games · ${(s.payCents / 100).toFixed(0)}</p>
              <ul className="flex flex-col gap-0.5">
                {s.lines.slice(0, 4).map((l) => (
                  <li key={l.gameId} className="mono text-xs text-silver">{l.dateLabel} {l.timeLabel} · {l.matchup}</li>
                ))}
                {s.lines.length > 4 && <li className="label text-[9px]">+{s.lines.length - 4} more</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
