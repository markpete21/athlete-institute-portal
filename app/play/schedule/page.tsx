import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { listBookings, type BookingRecord } from '@/lib/bookings';
import { getOrCreateFeed } from '@/lib/calendar';
import { listBrands } from '@/lib/brands/brands';
import { torontoDateOf } from '@/lib/schedule-views';

export const dynamic = 'force-dynamic';

// Compact range: "9:00–11:00 a.m." / "9:00 a.m.–1:00 p.m." — one line, no wrap.
const fmtRange = (fromIso: string, toIso: string) => {
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
  const a = t(fromIso);
  const b = t(toIso);
  const period = (s: string) => s.replace(/^[\d:]+\s*/, '');
  return period(a) === period(b) ? `${a.replace(/\s*[ap]\.m\.$/, '')}–${b}` : `${a}–${b}`;
};
const dayParts = (dateISO: string) => {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-CA', { weekday: 'long' }),
    rest: d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' }),
  };
};

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

  const [publicBookings, familyBookings, facRows, brands] = await Promise.all([
    listBookings({ from, to, publicOnly: true }),
    session.familyId ? listBookings({ from, to, familyId: session.familyId }) : Promise.resolve([]),
    supabaseAdmin().from('facilities').select('id, name').is('deleted_at', null),
    listBrands(),
  ]);
  const facName = new Map((facRows.data ?? []).map((f) => [f.id, f.name]));
  // Every row carries a mark: the booking's own logo when it has one, else
  // the org's default brand logo (brands are shared across all the apps).
  const defaultLogo = brands.find((b) => b.logoUrl)?.logoUrl ?? null;
  const markFor = (b: BookingRecord) => b.logo_url ?? defaultLogo;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Program schedule</p>
        <h1 className="text-5xl">
          Schedule<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        {session.userType === 'tenant' && (
          <p className="text-body">Read-only facility schedule - your view of the campus.</p>
        )}
      </header>

      {session.familyId && (
        <FamilySync familyId={session.familyId} clerkId={session.userId!} />
      )}

      {familyBookings.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl">Your family</h2>
          {groupByDate(familyBookings).map(([date, items]) => (
            <div key={date} className="flex flex-col gap-2">
              <p className="label text-[11px]">
                <span className="text-ink">{dayParts(date).weekday}</span>
                <span className="mx-1.5" style={{ color: 'var(--accent)' }}>·</span>
                {dayParts(date).rest}
              </p>
              {items.map((b) => (
                <div key={b.id} className="card flex flex-wrap items-center gap-x-4 gap-y-1 p-4 transition-colors hover:border-ink" style={{ borderLeft: '3px solid var(--accent)' }}>
                  <span className="mono w-40 shrink-0 whitespace-nowrap text-sm text-body">{fmtRange(b.starts_at, b.ends_at)}</span>
                  {markFor(b) && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-ink p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={markFor(b)!} alt="" className="max-h-full max-w-full object-contain" />
                    </span>
                  )}
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
            <p className="label text-[11px]">
              <span className="text-ink">{dayParts(date).weekday}</span>
              <span className="mx-1.5" style={{ color: 'var(--accent)' }}>·</span>
              {dayParts(date).rest}
            </p>
            {items.map((b) => (
              <div key={b.id} className="card group flex flex-wrap items-center gap-x-4 gap-y-1 p-4 transition-colors hover:border-ink">
                <span className="mono w-40 shrink-0 whitespace-nowrap text-sm text-body">{fmtRange(b.starts_at, b.ends_at)}</span>
                {markFor(b) && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-ink p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={markFor(b)!} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
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


/** Tokened ICS subscription for the household's own schedule. */
async function FamilySync({ familyId, clerkId }: { familyId: number; clerkId: string }) {
  const feed = await getOrCreateFeed('family', clerkId, familyId);
  const { headers } = await import('next/headers');
  const host = headers().get('host') ?? 'play.athleteinstitute.ca';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const url = `${proto}://${host}/api/calendar/${feed.token}`;
  return (
    <section className="card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-52 flex-1">
        <p className="text-sm font-bold text-ink">Sync to your calendar</p>
        <p className="text-sm text-silver">
          Subscribe once and your family&apos;s bookings stay up to date in
          Google, Apple or Outlook.
        </p>
      </div>
      <a href={url.replace(/^https?/, 'webcal')} className="btn-gold btn-sm">Open in calendar app</a>
      <a href={url} className="btn-ghost btn-sm" download>.ics</a>
    </section>
  );
}
