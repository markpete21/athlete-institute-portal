import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildTree, flattenTree, torontoDate, torontoTimeOfDay } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { checkAvailability, getBooking } from '@/lib/bookings';
import type { FacilityRow } from '@/lib/facilities';
import {
  cancelBookingAction,
  removeBookingLogoAction,
  saveBookingAction,
  uploadBookingLogoAction,
} from './actions';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  program: 'Program',
  event: 'Event',
  rental: 'Rental',
  internal: 'Internal',
};

/**
 * Booking detail / edit (Module 2 review). The wizard creates bookings and the
 * conflicts queue resolves clashes, but until now nothing could edit a booking
 * on its own terms - which left setup/cleanup buffers and the event logo
 * unreachable even though the engine and the TV boards both honour them.
 *
 * The page re-runs the availability engine against the booking's CURRENT state
 * (ignoring itself) so the operator sees live conflicts, operating-hours
 * warnings and seasonal closures before touching anything.
 */
export default async function BookingEditPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const booking = await getBooking(id);
  if (!booking) notFound();

  const { data: facRows } = await supabaseAdmin()
    .from('facilities')
    .select('id, parent_id, name, label, sort_order, bookable, deleted_at, location_id')
    .is('deleted_at', null);
  const tree = (facRows ?? []) as FacilityRow[];
  const ordered = flattenTree(buildTree(tree));
  const facilityName = (fid: number) => tree.find((f) => f.id === fid)?.name ?? `#${fid}`;

  const canceled = !!booking.canceled_at;
  const report = canceled
    ? null
    : await checkAvailability({
        facilityId: booking.facility_id,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        setupMinutes: booking.setup_minutes,
        cleanupMinutes: booking.cleanup_minutes,
        ignoreBookingId: booking.id,
      });

  const date = torontoDate(booking.starts_at);
  const start = torontoTimeOfDay(booking.starts_at);
  const end = torontoTimeOfDay(booking.ends_at);
  // Bookings crossing midnight are stored honestly but the single-date form
  // can't express them; flag rather than silently rewriting the end date.
  const crossesMidnight = torontoDate(booking.ends_at) !== date;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">
          <Link href={`/schedule?view=day&date=${date}`} className="underline">
            Admin · Schedule
          </Link>{' '}
          · Booking #{booking.id}
        </p>
        <h1 className="text-4xl">
          {booking.title}
          <span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tag">{SOURCE_LABEL[booking.source] ?? booking.source}</span>
          <span className="tag">{booking.is_internal ? 'internal' : 'external'}</span>
          <span className={booking.status === 'tentative' ? 'pill-status gold' : 'tag'}>
            {booking.status === 'tentative' ? 'quote hold' : 'confirmed'}
          </span>
          {booking.series_id && <span className="tag">part of a series</span>}
          {canceled && <span className="pill-status neg">cancelled</span>}
        </div>
      </header>

      {canceled && (
        <p className="card border-l-4 p-4 text-sm text-body" style={{ borderLeftColor: '#b4483c' }}>
          <b>This booking was cancelled.</b> It no longer occupies its facility and
          is hidden from every schedule. It is shown here read-only for reference.
        </p>
      )}

      {booking.series_id && !canceled && (
        <p className="card border-l-4 p-4 text-sm text-body" style={{ borderLeftColor: 'var(--accent)' }}>
          <b>This is one occurrence of a recurring series.</b> Saving here changes
          only this occurrence — the rest of the series is untouched.
        </p>
      )}

      {crossesMidnight && !canceled && (
        <p className="card border-l-4 p-4 text-sm text-body" style={{ borderLeftColor: '#b4483c' }}>
          <b>This booking ends on the following day.</b> The form below edits a
          single date, so saving would pull the end time back onto {date}. Change
          the times from the conflicts queue instead, or cancel and re-book.
        </p>
      )}

      {report && (report.conflicts.length > 0 || report.warnings.length > 0 || report.closures.length > 0) && (
        <section className="card flex flex-col gap-2 border-l-4 p-4" style={{ borderLeftColor: '#b4483c' }}>
          <h2 className="text-lg">Attention</h2>
          {report.conflicts.map((c) => (
            <p key={c.booking.id} className="text-sm text-body">
              Clashes with <b>{c.booking.title ?? `booking #${c.booking.id}`}</b> on{' '}
              {facilityName(c.booking.facility_id)} ({c.relation}) —{' '}
              <Link href="/conflicts" className="underline">resolve in the queue</Link>
            </p>
          ))}
          {report.warnings.map((w, i) => (
            <p key={`w${i}`} className="text-sm text-body">{w.message}</p>
          ))}
          {report.closures.map((c, i) => (
            <p key={`c${i}`} className="text-sm text-body">
              {c.message}
              {c.inherited && ' (closure set on a parent facility)'}
            </p>
          ))}
          <p className="text-sm text-silver">
            Hours and closures are advisory — you can save anyway.
          </p>
        </section>
      )}

      <form action={saveBookingAction} className="card flex flex-col gap-5 p-6">
        <input type="hidden" name="id" value={booking.id} />

        <div>
          <label className="field-label" htmlFor="title">Title</label>
          <input id="title" name="title" defaultValue={booking.title} required disabled={canceled} className="input" />
        </div>

        <div>
          <label className="field-label" htmlFor="facilityId">Facility</label>
          <select id="facilityId" name="facilityId" defaultValue={booking.facility_id} disabled={canceled} className="input">
            {ordered.map((f) => (
              <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
            ))}
          </select>
          <p className="mt-1 text-sm text-silver">
            Moving to a parent node occupies everything inside it; moving to a
            child frees its siblings.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor="date">Date</label>
            <input id="date" type="date" name="date" defaultValue={date} required disabled={canceled} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="start">Start</label>
            <input id="start" type="time" name="start" defaultValue={start} required disabled={canceled} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="end">End</label>
            <input id="end" type="time" name="end" defaultValue={end} required disabled={canceled} className="input" />
          </div>
        </div>

        <div className="border-t border-hairline pt-5">
          <h2 className="text-lg">Setup &amp; cleanup buffers</h2>
          <p className="mb-3 text-sm text-silver">
            Minutes held either side of the booking. Buffered time is treated as
            occupied by the conflict engine, so a 30-minute cleanup stops the
            next group being booked straight on top of the teardown — but the
            published start and end times stay as above.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="setupMinutes">Setup before (min)</label>
              <input
                id="setupMinutes" type="number" name="setupMinutes" min={0} max={480} step={5}
                defaultValue={booking.setup_minutes ?? 0} disabled={canceled} className="input"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="cleanupMinutes">Cleanup after (min)</label>
              <input
                id="cleanupMinutes" type="number" name="cleanupMinutes" min={0} max={480} step={5}
                defaultValue={booking.cleanup_minutes ?? 0} disabled={canceled} className="input"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 border-t border-hairline pt-5">
          <div>
            <label className="field-label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={booking.status} disabled={canceled} className="input">
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative (quote hold)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
            <input
              type="checkbox" name="showPublic"
              defaultChecked={booking.show_on_public_schedule} disabled={canceled}
            />
            show on the public schedule
          </label>
        </div>

        {!canceled && (
          <div className="flex items-center gap-3 border-t border-hairline pt-5">
            <button type="submit" className="btn-gold btn-sm">Save booking</button>
            <Link href={`/schedule?view=day&date=${date}`} className="btn-ghost btn-sm">Back to schedule</Link>
          </div>
        )}
      </form>

      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-2xl">Event logo</h2>
          <p className="text-sm text-silver">
            Shown beside the title on the TV display boards. PNG, JPEG, WebP or
            SVG, up to 2 MB — a transparent PNG reads best on the dark board.
          </p>
        </div>

        {booking.logo_url ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={booking.logo_url} alt=""
              className="h-20 w-20 rounded-md border border-hairline object-contain p-1"
            />
            {!canceled && (
              <form action={removeBookingLogoAction}>
                <input type="hidden" name="id" value={booking.id} />
                <button type="submit" className="btn-ghost btn-sm text-neg">Remove logo</button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-silver">No logo — the board shows the title alone.</p>
        )}

        {!canceled && (
          <form action={uploadBookingLogoAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={booking.id} />
            <div>
              <label className="field-label" htmlFor="logo">
                {booking.logo_url ? 'Replace logo' : 'Upload logo'}
              </label>
              <input
                id="logo" type="file" name="logo" required
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="input"
              />
            </div>
            <button type="submit" className="btn-gold btn-sm">Upload</button>
          </form>
        )}
      </section>

      {!canceled && (
        <section className="card flex flex-col gap-3 p-6">
          <div>
            <h2 className="text-2xl">Cancel this booking</h2>
            <p className="text-sm text-silver">
              A soft cancel: the slot is released and the booking drops off every
              schedule, but the record and its audit trail are kept.
              {booking.series_id && ' Only this occurrence is cancelled.'}
            </p>
          </div>
          <form action={cancelBookingAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={booking.id} />
            <div className="min-w-64 flex-1">
              <label className="field-label" htmlFor="reason">Reason (optional)</label>
              <input id="reason" name="reason" placeholder="Customer cancelled" className="input" />
            </div>
            <button type="submit" className="btn-ghost btn-sm text-neg">Cancel booking</button>
          </form>
        </section>
      )}
    </main>
  );
}
