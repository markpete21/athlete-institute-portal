import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildTree, flattenTree, formatCAD, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { findConflictPairs } from '@/lib/conflicts';
import { RENTAL_STATUS_COLOR, type RentalStatus } from '@ai/foundation';
import { listAddons } from '@/lib/rentals/rates';
import { getRental } from '@/lib/rentals/quotes';
import { listWaivers, signatureFor } from '@/lib/waivers';
import {
  addAddonAction,
  addLineAction,
  attachWaiverAction,
  cancelRentalAction,
  chargeInstallmentAction,
  emailQuoteAction,
  markBookedAction,
  recordPaymentAction,
  removeAddonAction,
  removeLineAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const TZ = 'America/Toronto';
const fmtBlock = (startsAt: string, endsAt: string) => {
  const d = new Date(startsAt).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return `${d} · ${t(startsAt)}–${t(endsAt)}`;
};

/** The quote builder (Module 3 Stage 2). */
export default async function RentalBuilderPage({ params }: { params: { id: string } }) {
  const rental = await getRental(Number(params.id));
  if (!rental) notFound();

  const [{ data: facRows }, addons, conflictPairs, { data: installments }, waivers, waiverSig] = await Promise.all([
    supabaseAdmin().from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
    listAddons(),
    findConflictPairs(new Date().toISOString(), new Date(Date.now() + 365 * 86400_000).toISOString()),
    supabaseAdmin().from('rental_installments').select('id, seq, label, amount_cents, due_date, is_deposit, status').eq('rental_id', rental.id).order('seq'),
    listWaivers(),
    (rental as { waiver_id?: number | null }).waiver_id
      ? signatureFor('rental', rental.id, (rental as { waiver_id: number }).waiver_id)
      : Promise.resolve(null),
  ]);
  const attachedWaiverId = (rental as { waiver_id?: number | null }).waiver_id ?? null;
  const ordered = flattenTree(buildTree((facRows ?? []) as FacilityNode[]));
  const conflictedBookingIds = new Set(conflictPairs.flatMap((p) => [p.a.id, p.b.id]));
  const playBase = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  const globalAddons = rental.addons.filter((a) => a.line_id == null);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · Rentals · #{rental.id}</p>
          <h1 className="text-4xl">
            {rental.title}<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <div className="mt-2 flex gap-2">
            <span className="tag" style={{ color: RENTAL_STATUS_COLOR[rental.status as RentalStatus], borderColor: RENTAL_STATUS_COLOR[rental.status as RentalStatus] }}>
              {rental.status.replace('_', ' ')}
            </span>
            {rental.is_internal && <span className="tag">internal $0</span>}
            {rental.contact_name && <span className="tag">{rental.contact_name}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`${playBase}/quote/${rental.quote_token}`} target="_blank" className="btn-ghost btn-sm">
            Online quote ↗
          </a>
          {rental.contact_email && (
            <form action={emailQuoteAction}>
              <input type="hidden" name="rentalId" value={rental.id} />
              <button type="submit" className="btn-gold btn-sm">Email quote link</button>
            </form>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Date/time blocks</h2>
        {rental.lines.map((line) => (
          <div key={line.id} className="card flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-ink">{line.facility_name}</span>
              <span className="mono text-sm text-body">{fmtBlock(line.starts_at, line.ends_at)}</span>
              <span className="tag">{line.rate_mode.replace('_', ' ')}</span>
              {line.booking_id && conflictedBookingIds.has(line.booking_id) && (
                <Link href="/conflicts" className="tag" style={{ color: '#b4483c', borderColor: '#b4483c' }}>
                  ⚠ conflict - resolve
                </Link>
              )}
              <span className="mono ml-auto text-ink">{formatCAD(line.line_total_cents)}</span>
              <form action={removeLineAction}>
                <input type="hidden" name="rentalId" value={rental.id} />
                <input type="hidden" name="lineId" value={line.id} />
                <button type="submit" className="btn-ghost btn-sm text-neg">Remove</button>
              </form>
            </div>
            {rental.addons.filter((a) => a.line_id === line.id).map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-t border-hairline pt-2 text-sm">
                <span className="text-body">↳ {a.name}{a.pricing_mode !== 'flat' ? ` × ${a.qty}` : ''}</span>
                <span className="mono ml-auto text-body">{formatCAD(a.total_cents)}</span>
                <form action={removeAddonAction}>
                  <input type="hidden" name="rentalId" value={rental.id} />
                  <input type="hidden" name="addonRowId" value={a.id} />
                  <button type="submit" className="btn-ghost btn-sm text-neg">×</button>
                </form>
              </div>
            ))}
          </div>
        ))}

        <form action={addLineAction} className="card grid gap-3 p-4 sm:grid-cols-6">
          <input type="hidden" name="rentalId" value={rental.id} />
          <div className="sm:col-span-2">
            <label className="field-label">Facility</label>
            <select name="facilityId" required className="input text-sm">
              {ordered.filter((f) => f.bookable).map((f) => (
                <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Date</label>
            <input name="date" type="date" required className="input text-sm" />
          </div>
          <div>
            <label className="field-label">Start</label>
            <input name="start" type="time" required className="input text-sm" />
          </div>
          <div>
            <label className="field-label">End</label>
            <input name="end" type="time" required className="input text-sm" />
          </div>
          <div className="flex items-end gap-2">
            <select name="rateMode" className="input text-sm" defaultValue="hourly">
              <option value="hourly">Hourly</option>
              <option value="full_day">Full day</option>
              <option value="flat">Flat</option>
            </select>
            <input name="rateOverride" placeholder="$ override" className="input w-24 text-sm" />
            <button type="submit" className="btn-gold btn-sm">Add</button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Add-ons</h2>
        {globalAddons.map((a) => (
          <div key={a.id} className="card flex items-center gap-3 p-3 text-sm">
            <span className="text-body">{a.name}{a.pricing_mode !== 'flat' ? ` × ${a.qty}` : ''}</span>
            <span className="mono ml-auto text-body">{formatCAD(a.total_cents)}</span>
            <form action={removeAddonAction}>
              <input type="hidden" name="rentalId" value={rental.id} />
              <input type="hidden" name="addonRowId" value={a.id} />
              <button type="submit" className="btn-ghost btn-sm text-neg">×</button>
            </form>
          </div>
        ))}
        <form action={addAddonAction} className="card flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="rentalId" value={rental.id} />
          <div className="min-w-44">
            <label className="field-label">Add-on</label>
            <select name="addonId" required className="input text-sm">
              {addons.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.pricing_mode.replace('_', ' ')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Attach to line</label>
            <select name="lineId" className="input text-sm" defaultValue="">
              <option value="">Whole quote</option>
              {rental.lines.map((l) => (
                <option key={l.id} value={l.id}>{l.facility_name} {fmtBlock(l.starts_at, l.ends_at)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Qty / hours</label>
            <input name="qty" type="number" step="0.5" defaultValue={1} className="input w-20 text-sm" />
          </div>
          <button type="submit" className="btn-gold btn-sm">Add</button>
        </form>
      </section>

      <section className="card flex max-w-sm flex-col gap-1 self-end p-5">
        <Row label="Subtotal" v={formatCAD(rental.subtotal_cents)} />
        <Row label="HST (13%)" v={formatCAD(rental.tax_cents)} />
        <div className="border-t border-hairline pt-1"><Row label="Total" v={formatCAD(rental.total_cents)} bold /></div>
        <Row label={`Deposit (${rental.deposit_pct}%)`} v={formatCAD(rental.deposit_cents)} accent />
        <Row label="Balance" v={formatCAD(rental.total_cents - rental.deposit_cents)} />
      </section>

      {/* Waiver (Stage 5) */}
      {!rental.is_internal && rental.status !== 'cancelled' && (
        <section className="card flex flex-wrap items-end gap-3 p-5">
          <div className="flex-1">
            <h2 className="mb-2 text-2xl">Waiver</h2>
            <form action={attachWaiverAction} className="flex items-end gap-2">
              <input type="hidden" name="rentalId" value={rental.id} />
              <select name="waiverId" defaultValue={attachedWaiverId ?? ''} className="input text-sm">
                <option value="">No waiver</option>
                {waivers.map((w) => <option key={w.id} value={w.id}>{w.name} (v{w.version})</option>)}
              </select>
              <button type="submit" className="btn-ghost btn-sm">Attach</button>
            </form>
          </div>
          {attachedWaiverId && (
            <div className="text-sm">
              {waiverSig ? (
                <span className="tag" style={{ color: '#3f7a5b', borderColor: '#3f7a5b' }}>
                  signed by {waiverSig.signer_name}
                </span>
              ) : (
                <span className="tag" style={{ color: '#b4483c', borderColor: '#b4483c' }}>
                  unsigned — blocks booking
                </span>
              )}
              <a href={`${playBase}/quote/${rental.quote_token}/sign`} target="_blank" className="btn-ghost btn-sm ml-2">
                Signing page ↗
              </a>
            </div>
          )}
        </section>
      )}

      {/* Payment schedule + status controls (Stage 4) */}
      {!rental.is_internal && rental.status !== 'cancelled' && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Payment</h2>

          {rental.status === 'quote' && rental.lines.length > 0 && (
            <div className="card flex items-center justify-between gap-4 p-5">
              <p className="text-body">
                Mark this quote booked to confirm the slots and issue the deposit
                (due 5 business days out; auto-charged if PAD is set up).
              </p>
              <form action={markBookedAction}>
                <input type="hidden" name="rentalId" value={rental.id} />
                <button type="submit" className="btn-gold">Mark booked</button>
              </form>
            </div>
          )}

          {(installments ?? []).length > 0 && (
            <table className="data-table">
              <thead>
                <tr><th>Installment</th><th>Due</th><th>Amount</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {(installments ?? []).map((inst) => (
                  <tr key={inst.id}>
                    <td className="text-ink">{inst.label}{inst.is_deposit && <span className="tag ml-2">deposit</span>}</td>
                    <td className="mono">{inst.due_date}</td>
                    <td className="mono">{formatCAD(inst.amount_cents)}</td>
                    <td><span className="tag">{inst.status}</span></td>
                    <td className="flex gap-2">
                      {inst.status === 'pending' && (
                        <>
                          <form action={chargeInstallmentAction}>
                            <input type="hidden" name="rentalId" value={rental.id} />
                            <input type="hidden" name="installmentId" value={inst.id} />
                            <button type="submit" className="btn-ghost btn-sm">Charge / invoice</button>
                          </form>
                          <form action={recordPaymentAction}>
                            <input type="hidden" name="rentalId" value={rental.id} />
                            <input type="hidden" name="installmentId" value={inst.id} />
                            <button type="submit" className="btn-ghost btn-sm">Record paid</button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form action={cancelRentalAction} className="flex items-center gap-2 self-start">
            <input type="hidden" name="rentalId" value={rental.id} />
            <input name="reason" placeholder="cancellation reason" className="input max-w-64 text-sm" />
            <button type="submit" className="btn-ghost btn-sm text-neg">Cancel rental (deposit non-refundable)</button>
          </form>
        </section>
      )}
    </main>
  );
}

function Row({ label, v, bold, accent }: { label: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-8">
      <span className={bold ? 'font-bold text-ink' : 'text-body'}>{label}</span>
      <span className="mono" style={accent ? { color: 'var(--accent)' } : undefined}>{v}</span>
    </div>
  );
}
