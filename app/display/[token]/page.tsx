import { getDisplayContent } from '@/lib/displays';
import { MediaPanel } from '@/components/display/MediaPanel';
import { Clock } from '@/components/display/Clock';

export const dynamic = 'force-dynamic';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' });

type Phase = 'now' | 'next' | 'done';

/** Where a booking sits relative to render time; refresh keeps it honest. */
function phaseOf(b: { starts_at: string; ends_at: string }, nowMs: number): Phase {
  if (nowMs >= Date.parse(b.ends_at)) return 'done';
  if (nowMs >= Date.parse(b.starts_at)) return 'now';
  return 'next';
}

/**
 * TV display (Module 2 Stage 6): a PUBLIC page at an unguessable token URL
 * (middleware exempts /display/* from auth - the token IS the credential).
 * Dark, readable-across-a-room, auto-refreshing every 3 minutes; only
 * bookings flagged for the public schedule ever appear. Today's rows carry
 * live state: in-progress events lead with the accent, finished ones recede.
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

  const { display, template, todaysBookings, upcoming, facilityNames } = content;
  const nowMs = Date.now();

  // Header title: the display's facility scope ("Fieldhouse") — the wordmark
  // already owns the media panel. Whole-campus displays fall back to the org.
  const scopeNames = (display.facility_ids ?? [])
    .map((id) => facilityNames.get(id))
    .filter(Boolean) as string[];
  const heading = scopeNames.length > 0 && scopeNames.length <= 2 ? scopeNames.join(' + ') : 'Athlete Institute';

  const upcomingByDay = new Map<string, typeof upcoming>();
  for (const b of upcoming.slice(0, 12)) {
    const d = fmtDate(b.starts_at);
    upcomingByDay.set(d, [...(upcomingByDay.get(d) ?? []), b]);
  }

  return (
    <main className="flex h-screen overflow-hidden bg-ink text-white">
      {/* meta refresh: zero-JS auto-reload for kiosk devices */}
      <meta httpEquiv="refresh" content="180" />

      {/* 9:16 media panel */}
      <aside className="relative hidden w-[28vw] shrink-0 overflow-hidden lg:block">
        <MediaPanel
          mode={template?.media_mode ?? 'image'}
          urls={template?.media_urls ?? []}
          slideSeconds={template?.slide_seconds ?? 8}
        />
      </aside>

      {/* schedule */}
      <section className="dot-field flex h-full flex-1 flex-col gap-10 overflow-hidden px-14 py-12">
        <header className="flex shrink-0 items-baseline justify-between border-b border-white/15 pb-6">
          {/* !text-white: the global h1 rule paints ink, invisible on this dark page */}
          <h1 className="!text-white text-5xl font-extrabold tracking-tight">
            {heading}<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <p className="flex items-baseline gap-6 font-mono uppercase tracking-[0.2em] text-white/60">
            <span className="text-xl">
              {new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto', weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            <Clock className="text-3xl font-medium text-white" />
          </p>
        </header>

        {(template?.show_today ?? true) && (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            <p className="font-mono text-lg uppercase tracking-[0.24em]" style={{ color: 'var(--accent)' }}>
              Today
            </p>
            {todaysBookings.length === 0 && (
              <p className="text-3xl font-bold text-white/40">No public events today.</p>
            )}
            <div className="flex flex-col gap-0 overflow-hidden">
              {todaysBookings.map((b) => {
                const phase = phaseOf(b, nowMs);
                return (
                  <div
                    key={b.id}
                    className={`flex items-center gap-6 border-b border-white/10 py-4 ${phase === 'done' ? 'opacity-35' : ''}`}
                  >
                    {/* live marker column keeps every row aligned */}
                    <span className="flex w-20 shrink-0 justify-start">
                      {phase === 'now' ? (
                        <span
                          className="rounded-full px-3 py-1 font-mono text-sm font-bold uppercase tracking-[0.18em] text-ink"
                          style={{ backgroundColor: 'var(--accent, #9e8959)' }}
                        >
                          Now
                        </span>
                      ) : (
                        <span className="font-mono text-sm uppercase tracking-[0.18em] text-white/30">
                          {phase === 'done' ? 'Done' : ''}
                        </span>
                      )}
                    </span>
                    <span className="w-52 shrink-0 font-mono text-2xl tabular-nums text-white/80">
                      {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                    </span>
                    {b.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logo_url} alt="" className="h-14 w-14 shrink-0 object-contain" />
                    )}
                    {/* full title always visible: wrap, never clip */}
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-4xl font-bold leading-[1.05] tracking-tight">
                      {b.title}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-xl uppercase tracking-wider text-white/50">
                      {facilityNames.get(b.facility_id)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(template?.show_upcoming ?? true) && upcomingByDay.size > 0 && (
          <div className="flex shrink-0 flex-col gap-5 border-t border-white/15 pt-8">
            <p className="font-mono text-lg uppercase tracking-[0.24em]" style={{ color: 'var(--accent)' }}>
              Coming up
            </p>
            <div className="grid gap-x-14 gap-y-4 md:grid-cols-2">
              {[...upcomingByDay.entries()].slice(0, 4).map(([day, items]) => (
                <div key={day} className="flex flex-col gap-2">
                  <p className="font-mono text-base uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
                    <span className="text-white/50">{day}</span>
                  </p>
                  {items.map((b) => (
                    <p key={b.id} className="flex items-baseline gap-4 truncate text-2xl font-bold">
                      <span className="w-24 shrink-0 font-mono text-lg font-normal tabular-nums text-white/50">
                        {fmtTime(b.starts_at)}
                      </span>
                      {b.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logo_url} alt="" className="h-8 w-8 self-center object-contain" />
                      )}
                      <span className="min-w-0 whitespace-normal break-words leading-tight">{b.title}</span>
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
