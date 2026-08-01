import Link from 'next/link';
import { headers } from 'next/headers';
import { getPortalSession } from '@/lib/auth';
import { getOrCreateFeed } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

/**
 * Calendar sync for the master schedule: a per-staff-member tokened ICS URL
 * to subscribe to from Google/Apple/Outlook. Get-or-create is idempotent, so
 * revisiting always shows the same URL and never breaks a subscription.
 */
export default async function CalendarSyncPage() {
  const session = await getPortalSession();
  const feed = await getOrCreateFeed('master', session.userId!);

  const host = headers().get('host') ?? 'play.athleteinstitute.ca';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const httpsUrl = `${proto}://${host.replace(/^admin\./, 'play.')}/api/calendar/${feed.token}`;
  const webcalUrl = httpsUrl.replace(/^https?/, 'webcal');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">Admin · Master schedule</p>
        <h1 className="text-4xl">
          Calendar sync<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Subscribe your calendar to the master schedule. The feed updates
          automatically — bookings appear, move and disappear as they change
          here. Quote holds arrive marked tentative.
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-6">
        <span className="field-label">Your private feed URL</span>
        <code className="mono block break-all border border-hairline bg-paper-panel p-3 text-xs">{httpsUrl}</code>
        <p className="text-sm text-silver">
          Treat it like a password — anyone with the URL can read the schedule.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={webcalUrl} className="btn-gold btn-sm">Open in calendar app</a>
          <a href={httpsUrl} className="btn-ghost btn-sm" download>Download .ics</a>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Set-up by app</h2>
        <div className="card p-5">
          <p className="text-sm font-bold text-ink">Google Calendar</p>
          <p className="text-sm text-body">
            Settings → Add calendar → <b>From URL</b> → paste the feed URL.
            Google refreshes subscribed calendars every few hours.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-bold text-ink">Apple Calendar (Mac / iPhone)</p>
          <p className="text-sm text-body">
            File → New Calendar Subscription (Mac) or Settings → Calendar →
            Accounts → Add Subscribed Calendar (iPhone) → paste the URL — or
            just tap <b>Open in calendar app</b> above.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-bold text-ink">Outlook</p>
          <p className="text-sm text-body">
            Add calendar → <b>Subscribe from web</b> → paste the feed URL.
          </p>
        </div>
      </section>

      <div>
        <Link href="/schedule" className="btn-ghost btn-sm">← Back to schedule</Link>
      </div>
    </main>
  );
}
