import { listWaivers } from '@/lib/waivers';
import { createWaiverAction, updateWaiverAction } from './actions';

export const dynamic = 'force-dynamic';

const TYPES = ['', 'camp', 'event', 'tournament', 'league', 'clinic', 'other'];

/**
 * Waiver editor (Module 3 Stage 5, reused by Module 4). Compose named waivers,
 * optionally default one per booking type, edit (body edits bump the version).
 */
export default async function WaiversPage() {
  const waivers = await listWaivers(true);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Forms</p>
        <h1 className="text-5xl">Waivers<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">
          Compose waivers and attach them to rentals (or programs). The renter
          signs once electronically; a signed waiver gates confirming the
          booking. Editing the text bumps the version.
        </p>
      </header>

      {waivers.map((w) => (
        <form key={w.id} action={updateWaiverAction} className="card flex flex-col gap-3 p-5">
          <input type="hidden" name="id" value={w.id} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="field-label">Name</label>
              <input name="name" defaultValue={w.name} className="input" />
            </div>
            <div>
              <label className="field-label">Default for type</label>
              <select name="defaultForBookingType" defaultValue={w.default_for_booking_type ?? ''} className="input text-sm">
                {TYPES.map((t) => <option key={t} value={t}>{t || '(none)'}</option>)}
              </select>
            </div>
            <span className="tag">v{w.version}</span>
            <label className="flex items-center gap-1 pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
              <input type="checkbox" name="active" defaultChecked={w.active} /> active
            </label>
          </div>
          <textarea name="body" defaultValue={w.body} rows={6} className="input font-mono text-sm" />
          <button type="submit" className="btn-ghost btn-sm self-end">Save (edits bump version)</button>
        </form>
      ))}

      <form action={createWaiverAction} className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl">New waiver</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="field-label" htmlFor="n">Name</label>
            <input id="n" name="name" required placeholder="Facility Rental Waiver" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="dt">Default for type</label>
            <select id="dt" name="defaultForBookingType" className="input text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{t || '(none)'}</option>)}
            </select>
          </div>
        </div>
        <textarea name="body" required rows={6} placeholder="Waiver text…" className="input font-mono text-sm" />
        <button type="submit" className="btn-gold btn-sm self-end">Create waiver</button>
      </form>
    </main>
  );
}
