import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { listBookings, type BookingRecord } from '@/lib/bookings';
import { torontoDateOf } from '@/lib/schedule-views';

export const dynamic = 'force-dynamic';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
const fmtDay = (dateISO: string) =>
  new Date(`${dateISO}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });

function groupByDate(bookings: BookingRecord[]): Array<[string, BookingRecord[]]> {
  const map = new Map<string, BookingRecord[]>();
  for (const b of bookings) {
    const d = torontoDateOf(b.starts_at);
    map.set(d, [...(map.get(d) ?? []), b]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * The play schedule (Module 2 Stage 7):
 *  - PUBLIC curated view: only show_on_public_schedule bookings (programs +
 *    events by default; rentals/internal stay hidden). This is also the
 *    tenants' read-only home.
 *  - FAMILY view: a signed-in family member additionally sees their own
 *    household's bookings (family_id linkage - M3/M4 populate it).
 */
export default async function PlaySchedulePage() {
  const session = await getPortalSession();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 14 * 86400_000).toISOString();

  const [publicBookings, familyBookings, facRows] = await Promise.all([
    listBookings({ from, to, publicOnly: true }),
    session.familyId ? listBookings({ from, to, familyId: session.familyId }) : Promise.resolve([]),
    supabaseAdmin().from('facilities').select('id, name').is('deleted_at', null),
  ]);
  const facName = new Map((facRows.data ?? []).map((f) => [f.id, f.name]));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Facility schedule</p>
        <h1 className="text-5xl">
          Schedule<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        {session.userType === 'tenant' && (
          <p className="text-body">Read-only facility schedule - your view of the campus.</p>
        )}
      </header>

      {familyBookings.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl">Your family</h2>
          {groupByDate(familyBookings).map(([date, items]) => (
            <div key={date} className="flex flex-col gap-2">
              <p className="label text-[11px]">{fmtDay(date)}</p>
              {items.map((b) => (
                <div key={b.id} className="card flex items-center gap-4 p-4" style={{ borderLeft: '3px solid var(--accent)' }}>
                  <span className="mono w-36 shrink-0 text-sm text-body">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span>
                  <span className="font-bold text-ink">{b.title}</span>
                  <span className="ml-auto label text-[10px]">{facName.get(b.facility_id)}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl">Coming up</h2>
        {publicBookings.length === 0 && (
          <p className="text-body">Nothing on the public schedule for the next two weeks.</p>
        )}
        {groupByDate(publicBookings).map(([date, items]) => (
          <div key={date} className="flex flex-col gap-2">
            <p className="label text-[11px]">{fmtDay(date)}</p>
            {items.map((b) => (
              <div key={b.id} className="card flex items-center gap-4 p-4">
                <span className="mono w-36 shrink-0 text-sm text-body">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span>
                {b.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo_url} alt="" className="h-8 w-8 shrink-0 object-contain" />
                )}
                <span className="font-bold text-ink">{b.title}</span>
                <span className="ml-auto label text-[10px]">{facName.get(b.facility_id)}</span>
              </div>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
