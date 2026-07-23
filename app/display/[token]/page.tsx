import { getDisplayContent } from '@/lib/displays';
import { MediaPanel } from '@/components/display/MediaPanel';

export const dynamic = 'force-dynamic';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' });

/**
 * TV display (Module 2 Stage 6): a PUBLIC page at an unguessable token URL
 * (middleware exempts /display/* from auth - the token IS the credential).
 * Dark, readable-across-a-room, auto-refreshing every 3 minutes; only
 * bookings flagged for the public schedule ever appear.
 */
export default async function DisplayPage({ params }: { params: { token: string } }) {
  const content = await getDisplayContent(params.token);

  if (!content) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="text-2xl font-extrabold text-white/50">Display not configured.</p>
      </main>
    );
  }

  const { template, todaysBookings, upcoming, facilityNames } = content;
  const upcomingByDay = new Map<string, typeof upcoming>();
  for (const b of upcoming.slice(0, 12)) {
    const d = fmtDate(b.starts_at);
    upcomingByDay.set(d, [...(upcomingByDay.get(d) ?? []), b]);
  }

  return (
    <main className="flex min-h-screen bg-ink text-white">
      {/* meta refresh: zero-JS auto-reload for kiosk devices */}
      <meta httpEquiv="refresh" content="180" />

      {/* 9:16 media panel */}
      <aside className="relative hidden w-[28vw] shrink-0 overflow-hidden lg:block" style={{ aspectRatio: '9/16', maxHeight: '100vh' }}>
        <MediaPanel
          mode={template?.media_mode ?? 'image'}
          urls={template?.media_urls ?? []}
          slideSeconds={template?.slide_seconds ?? 8}
        />
      </aside>

      {/* schedule */}
      <section className="dot-field flex min-h-screen flex-1 flex-col gap-10 overflow-hidden p-12">
        <header className="flex items-baseline justify-between border-b border-white/15 pb-6">
          <h1 className="text-5xl font-extrabold tracking-tight">
            Athlete Institute<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <p className="font-mono text-xl uppercase tracking-[0.2em] text-white/60">
            {new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto', weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </header>

        {(template?.show_today ?? true) && (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-lg uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>Today</p>
            {todaysBookings.length === 0 && <p className="text-2xl text-white/50">No public events today.</p>}
            <div className="flex flex-col gap-3">
              {todaysBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-5 border-b border-white/10 pb-3">
                  <span className="w-44 shrink-0 font-mono text-2xl text-white/80">
                    {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                  </span>
                  {b.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo_url} alt="" className="h-12 w-12 shrink-0 object-contain" />
                  )}
                  <span className="truncate text-3xl font-bold">{b.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-lg uppercase tracking-wider text-white/50">
                    {facilityNames.get(b.facility_id)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(template?.show_upcoming ?? true) && upcomingByDay.size > 0 && (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-lg uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>Coming up</p>
            <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
              {[...upcomingByDay.entries()].map(([day, items]) => (
                <div key={day} className="flex flex-col gap-1">
                  <p className="font-mono text-base uppercase tracking-widest text-white/50">{day}</p>
                  {items.map((b) => (
                    <p key={b.id} className="flex items-center gap-3 truncate text-xl font-bold">
                      {b.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logo_url} alt="" className="h-7 w-7 object-contain" />
                      )}
                      {b.title}
                      <span className="font-mono text-sm font-normal text-white/50">{fmtTime(b.starts_at)}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
