import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildTree, flattenTree, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { PrintButton } from '@/components/PrintButton';
import { getMediaDay } from '@/lib/competitive/mediaDay';
import { notifyMediaDayAction, planMediaDayAction } from '../../actions';

export const dynamic = 'force-dynamic';

const DAY_LABEL = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(iso + 'T12:00:00'));

/**
 * Media day scheduler: per-team photo windows sized from the real roster and
 * family photo consent, booked as a real facility hold through the Module 2
 * engine. Families get their team's arrival time, not the whole grid.
 */
export default async function MediaDayPage({ params }: { params: { id: string } }) {
  const divisionId = Number(params.id);
  const db = supabaseAdmin();
  const [{ data: div }, { data: facRows }, plan] = await Promise.all([
    db.from('divisions').select('id, name, programs(name)').eq('id', divisionId).maybeSingle(),
    db.from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    getMediaDay(divisionId),
  ]);
  if (!div) notFound();
  const ordered = flattenTree(buildTree((facRows ?? []) as FacilityNode[]));
  const totalNoConsent = (plan?.windows ?? []).reduce((n, w) => n + w.noConsent.length, 0);
  const totalPortraits = (plan?.windows ?? []).reduce((n, w) => n + w.consented, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-14">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">{(div.programs as unknown as { name: string } | null)?.name} · {div.name}</p>
        <h1 className="text-3xl">Media day<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body max-w-[62ch] text-sm">
          Each team gets a timed window sized from its actual roster: team photo, then one portrait
          slot per player whose family gave photo consent at registration. The hold books through
          the conflict engine - an existing rental surfaces in the conflicts queue, never a
          double-booking.
        </p>
      </header>

      <section className="card no-print flex flex-col gap-3 p-5">
        <h2 className="text-2xl">{plan ? 'Replan the day' : 'Plan the day'}</h2>
        <form action={planMediaDayAction} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="divisionId" value={divisionId} />
          <div className="sm:col-span-2"><label className="field-label">Facility</label>
            <select name="facilityId" required defaultValue={plan?.facilityId ?? ''} className="input text-sm">
              {ordered.filter((f) => f.bookable).map((f) => <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>)}
            </select>
          </div>
          <div><label className="field-label">Date</label><input name="day" type="date" required defaultValue={plan?.day ?? ''} className="input text-sm" /></div>
          <div><label className="field-label">First team arrives</label><input name="startTime" type="time" defaultValue={plan?.startHHMM ?? '09:00'} className="input text-sm" /></div>
          <div><label className="field-label">Team photo (min)</label><input name="teamPhotoMinutes" type="number" defaultValue={plan?.teamPhotoMinutes ?? 10} min={1} max={60} className="input text-sm" /></div>
          <div><label className="field-label">Per portrait (min)</label><input name="portraitMinutes" type="number" defaultValue={plan?.portraitMinutes ?? 2} min={1} max={30} className="input text-sm" /></div>
          <div><label className="field-label">Buffer (min)</label><input name="bufferMinutes" type="number" defaultValue={plan?.bufferMinutes ?? 10} min={0} max={60} className="input text-sm" /></div>
          <div className="flex flex-col justify-end gap-1 pb-1">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includePortraits" defaultChecked={plan?.includePortraits ?? true} /> Individual portraits</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeCoach" defaultChecked={plan?.includeCoach ?? true} /> Coach in team photo</label>
          </div>
          <div className="flex items-end sm:col-span-2"><button type="submit" className="btn-gold btn-sm">{plan ? 'Rebuild windows + rebook hold' : 'Build media day schedule'}</button></div>
        </form>
        <p className="label text-[9px]">Windows re-flow from live rosters every time - a roster swap just means one click here.</p>
      </section>

      {plan && (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl">{DAY_LABEL(plan.day)} · {plan.facilityName}</h2>
              <span className="mono text-sm text-silver">{plan.windows.length} teams · {totalPortraits} portraits · wraps {plan.wrapHHMM}</span>
            </div>
            <div className="flex flex-col gap-3">
              {plan.windows.map((w) => (
                <div key={w.teamId} className="card p-4" style={{ breakInside: 'avoid' }}>
                  <div className="flex items-baseline justify-between border-b border-hairline pb-2">
                    <h3 className="text-lg text-ink">{w.teamName}</h3>
                    <span className="mono text-sm text-silver">{w.starts}–{w.ends}</span>
                  </div>
                  <ul className="mono flex flex-col gap-1 pt-2 text-sm">
                    <li><span className="text-ink">{w.arrive}</span> <span className="text-silver">arrive, jerseys on</span></li>
                    <li><span className="text-ink">{w.starts}</span> <span className="text-silver">team photo{plan.includeCoach ? ' (with coach)' : ''}</span></li>
                    {plan.includePortraits && <li><span className="text-ink">{w.photoEnds}</span> <span className="text-silver">portraits — {w.consented} player{w.consented === 1 ? '' : 's'} × {plan.portraitMinutes} min</span></li>}
                    {w.noConsent.map((n) => (
                      <li key={n} className="text-xs" style={{ color: 'var(--accent)' }}>no portrait — {n} (no photo consent; team photo only, never published)</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="card no-print flex flex-wrap items-center gap-3 p-4">
            <form action={notifyMediaDayAction}>
              <input type="hidden" name="divisionId" value={divisionId} />
              <button type="submit" className="btn-gold btn-sm">Email families their arrival times</button>
            </form>
            <PrintButton />
            <span className="label text-[10px]">
              {plan.notifiedAt ? `Families last notified ${new Date(plan.notifiedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'One message per household: team, arrival time, bring the jersey.'}
              {totalNoConsent > 0 ? ` · ${totalNoConsent} player${totalNoConsent === 1 ? '' : 's'} without photo consent handled automatically` : ''}
            </span>
          </section>
        </>
      )}

      <Link href={`/competitive/${divisionId}`} className="no-print label text-[11px] hover:text-ink">← Back to division</Link>
      <style>{'@media print { .no-print, .ash-rail, .ash-topbar, .ash-infobar { display: none !important } main { padding: 0 } }'}</style>
    </main>
  );
}
