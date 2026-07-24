import { notFound } from 'next/navigation';
import { torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { dayRoster } from '@/lib/camps/camps';
import { checkInAction, checkOutAction } from '../../actions';

export const dynamic = 'force-dynamic';

/** Mobile check-in / check-out tool (Module 8 Stage 3), gated by camp_checkin. */
export default async function CheckinPage({ params, searchParams }: { params: { weekId: string }; searchParams: { day?: string } }) {
  const weekId = Number(params.weekId);
  const { data: week } = await supabaseAdmin().from('camp_weeks').select('name, start_date').eq('id', weekId).maybeSingle();
  if (!week) notFound();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? '') ? searchParams.day! : torontoToday();
  const roster = await dayRoster(weekId, day);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">{week.name}</p>
        <h1 className="text-3xl">Check-in<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <form method="get" className="flex items-end gap-2">
          <div><label className="field-label">Day</label><input name="day" type="date" defaultValue={day} className="input text-sm" /></div>
          <button className="btn-ghost btn-sm">Go</button>
        </form>
      </header>

      {roster.length === 0 && <p className="text-body">No campers registered for this week.</p>}
      {roster.map((c) => (
        <div key={c.registrationId} className="card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-ink">{c.name}</span>
            <span className="tag" style={c.checkedOut ? { color: '#3f7a5b', borderColor: '#3f7a5b' } : c.checkedIn ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
              {c.checkedOut ? `out · ${c.pickup}` : c.checkedIn ? 'in' : 'not in'}
            </span>
          </div>
          <div className="flex gap-2">
            {!c.checkedIn && (
              <form action={checkInAction}><input type="hidden" name="campWeekId" value={weekId} /><input type="hidden" name="registrationId" value={c.registrationId} /><input type="hidden" name="day" value={day} /><button className="btn-gold btn-sm">Check in</button></form>
            )}
            {c.checkedIn && !c.checkedOut && (
              <form action={checkOutAction} className="flex items-end gap-2">
                <input type="hidden" name="campWeekId" value={weekId} /><input type="hidden" name="registrationId" value={c.registrationId} /><input type="hidden" name="day" value={day} />
                <input name="pickup" placeholder="Picked up by" className="input text-sm" />
                <button className="btn-ghost btn-sm">Check out</button>
              </form>
            )}
          </div>
        </div>
      ))}
    </main>
  );
}
