'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { bookWizardAction, type WizardPayload, type WizardResult } from './actions';

/**
 * The guided booking flow. Steps adapt to the selection:
 *   1 When & where - facility + date + time lines (prefilled from the Gantt)
 *   2 What         - internal (brand/business unit + type) or rental
 *                    (organization/contact + type), title
 *   3 Fees         - rental only: per-line rate + add-ons ($0 internal skips)
 *   4 Extras       - notes, public flag, block-other-facilities rows
 *   5 Review       - summary, then submit
 */

export interface WizardFacility {
  id: number;
  name: string;
  depth: number;
  hourlyCents: number | null;
  fullDayCents: number | null;
}

interface LineDraft {
  facilityId: number;
  date: string;
  start: string;
  end: string;
  rateMode: 'hourly' | 'full_day';
  rateOverride: string; // dollars, '' = use card rate
}

interface BlockDraft {
  facilityId: number;
  date: string;
  start: string;
  end: string;
}

const cad = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

export function Wizard({
  facilities,
  businessUnits,
  organizations,
  addons,
  bookingTypes,
  intent,
  defaultDate,
  prefillSlots,
  prefillFacilities,
}: {
  facilities: WizardFacility[];
  businessUnits: Array<{ id: number; name: string }>;
  organizations: Array<{ id: number; name: string }>;
  addons: Array<{ id: number; name: string; pricingMode: 'flat' | 'per_unit' | 'per_hour'; priceCents: number }>;
  /** Admin-managed type chips (Rentals > Settings). */
  bookingTypes: Array<{ name: string; appliesTo: 'internal' | 'rental' | 'both' }>;
  /** book = concrete/confirmed; quote = tentative hold (rental only). */
  intent: 'book' | 'quote';
  defaultDate: string;
  prefillSlots: Array<{ facilityId: number; start: string; end: string }>;
  prefillFacilities: number[];
}) {
  const facById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);

  const [step, setStep] = useState(1);
  const [lines, setLines] = useState<LineDraft[]>(() => {
    const fromSlots = prefillSlots.map((s) => ({
      facilityId: s.facilityId, date: defaultDate, start: s.start, end: s.end,
      rateMode: 'hourly' as const, rateOverride: '',
    }));
    const fromFacilities = prefillFacilities.map((id) => ({
      facilityId: id, date: defaultDate, start: '', end: '',
      rateMode: 'hourly' as const, rateOverride: '',
    }));
    const drafts = [...fromSlots, ...fromFacilities];
    return drafts.length
      ? drafts
      : [{ facilityId: facilities[0]?.id ?? 0, date: defaultDate, start: '', end: '', rateMode: 'hourly', rateOverride: '' }];
  });

  // A quote is by definition a priced customer hold - internal is not offered.
  const [kind, setKind] = useState<'internal' | 'rental'>(intent === 'quote' ? 'rental' : 'internal');
  const [title, setTitle] = useState('');
  const [bookingType, setBookingType] = useState('');
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [depositPct, setDepositPct] = useState('25');
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [showPublic, setShowPublic] = useState(false);
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WizardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linesValid = lines.length > 0 && lines.every(
    (l) => l.facilityId && l.date && /^\d{2}:\d{2}$/.test(l.start) && /^\d{2}:\d{2}$/.test(l.end) && l.end > l.start,
  );
  const blocksValid = blocks.every(
    (b) => b.facilityId && b.date && /^\d{2}:\d{2}$/.test(b.start) && /^\d{2}:\d{2}$/.test(b.end) && b.end > b.start,
  );
  const whoValid = title.trim().length > 0 && bookingType.length > 0
    && (kind === 'internal' ? businessUnitId !== '' : true);

  const lineRate = (l: LineDraft): number | null => {
    if (l.rateOverride !== '') {
      const v = Math.round(Number(l.rateOverride) * 100);
      return Number.isFinite(v) ? v : null;
    }
    const f = facById.get(l.facilityId);
    return l.rateMode === 'hourly' ? f?.hourlyCents ?? null : f?.fullDayCents ?? null;
  };
  const lineTotal = (l: LineDraft): number | null => {
    const rate = lineRate(l);
    if (rate == null) return null;
    return l.rateMode === 'hourly' ? Math.round(rate * hoursBetween(l.start, l.end)) : rate;
  };
  const feesTotal = kind === 'rental'
    ? lines.reduce((sum, l) => sum + (lineTotal(l) ?? 0), 0)
      + addons.reduce((sum, a) => sum + (addonQty[a.id] ?? 0) * a.priceCents, 0)
    : 0;
  const missingRates = kind === 'rental' && lines.some((l) => lineRate(l) == null);

  const steps = kind === 'internal'
    ? ['When & where', 'What', 'Extras', 'Review']
    : ['When & where', 'What', 'Fees', 'Extras', 'Review'];
  const stepName = steps[step - 1];

  const facilityOptions = facilities.map((f) => (
    <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
  ));

  async function submit() {
    setSubmitting(true);
    setError(null);
    const payload: WizardPayload = {
      kind,
      intent,
      title,
      bookingType,
      businessUnitId: businessUnitId ? Number(businessUnitId) : null,
      organizationId: organizationId ? Number(organizationId) : null,
      contactName, contactEmail, contactPhone,
      depositPct: Number(depositPct) || 25,
      notes,
      showPublic,
      lines: lines.map((l) => ({
        facilityId: l.facilityId, date: l.date, start: l.start, end: l.end,
        rateMode: l.rateMode,
        unitRateCents: l.rateOverride !== '' ? Math.round(Number(l.rateOverride) * 100) : null,
      })),
      addons: Object.entries(addonQty).map(([id, qty]) => ({ addonId: Number(id), qty })).filter((a) => a.qty > 0),
      blocks,
    };
    try {
      setResult(await bookWizardAction(payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-2xl">Booked{result.conflictCount > 0 ? ' — with conflicts' : ''}.</h2>
        <p className="text-body">
          {result.lineCount} facility line{result.lineCount === 1 ? '' : 's'}
          {result.blockCount > 0 ? ` + ${result.blockCount} blocked facilit${result.blockCount === 1 ? 'y' : 'ies'}` : ''}
          {kind === 'rental' && intent === 'quote' ? ' held as a tentative quote.' : ' confirmed.'}
          {kind === 'rental' && intent === 'book' && ' Set up the payment schedule on the rental screen.'}
        </p>
        {result.conflictCount > 0 && (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: '#b4483c' }}>
            {result.conflictCount} conflict{result.conflictCount === 1 ? '' : 's'} flagged — resolve in the queue.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/rentals/${result.rentalId}`} className="btn-gold btn-sm">
            {kind === 'rental' ? (intent === 'quote' ? 'Open quote' : 'Open rental record') : 'Open booking record'}
          </Link>
          <Link href={`/schedule?view=day&date=${lines[0]?.date ?? defaultDate}`} className="btn-ghost btn-sm">Back to schedule</Link>
          {result.conflictCount > 0 && <Link href="/conflicts" className="btn-ghost btn-sm text-neg">Conflicts queue</Link>}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* step rail */}
      <ol className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <li
            key={s}
            className="tag"
            style={i + 1 === step ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : i + 1 < step ? { color: 'var(--ink, #1e1e1e)' } : undefined}
          >
            {i + 1} · {s}
          </li>
        ))}
      </ol>

      {stepName === 'When & where' && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">When &amp; where</h2>
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 border-b border-hairline pb-2 last:border-0">
                <div className="min-w-52 flex-1">
                  <label className="field-label">Facility</label>
                  <select
                    className="input h-9 text-sm"
                    value={l.facilityId}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, facilityId: Number(e.target.value) } : x)))}
                  >
                    {facilityOptions}
                  </select>
                </div>
                <div>
                  <label className="field-label">Date</label>
                  <input type="date" className="input h-9 text-sm" value={l.date}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="field-label">Start</label>
                  <input type="time" className="input h-9 text-sm" value={l.start}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="field-label">End</label>
                  <input type="time" className="input h-9 text-sm" value={l.end}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-sm text-neg"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  disabled={lines.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setLines([...lines, { ...lines[lines.length - 1], rateOverride: '' }])}
            >
              + Add another facility / time
            </button>
          </div>
          <div className="flex justify-end">
            <button type="button" className="btn-gold btn-sm" disabled={!linesValid} onClick={() => setStep(step + 1)}>
              Continue
            </button>
          </div>
        </section>
      )}

      {stepName === 'What' && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">{intent === 'quote' ? 'Who is the quote for?' : 'What kind of booking?'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(intent === 'quote' ? (['rental'] as const) : (['internal', 'rental'] as const)).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setKind(k); setBookingType(''); }}
                className="card flex flex-col items-start gap-1 p-4 text-left transition-colors"
                style={kind === k ? { borderColor: 'var(--accent)' } : undefined}
              >
                <span className="text-lg font-bold text-ink">{k === 'internal' ? 'Internal' : 'Rental'}</span>
                <span className="text-sm text-silver">
                  {k === 'internal' ? 'No charge — one of our brands using our own space.' : 'A customer or organization renting the space.'}
                </span>
              </button>
            ))}
          </div>

          {kind === 'internal' ? (
            <div>
              <label className="field-label" htmlFor="bu">Brand / business unit</label>
              <select id="bu" className="input" value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value)}>
                <option value="">Select…</option>
                {businessUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="org">Organization (optional)</label>
                <select id="org" className="input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                  <option value="">—</option>
                  {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="cn">Contact name</label>
                <input id="cn" className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="ce">Contact email</label>
                <input id="ce" type="email" className="input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="cp">Contact phone</label>
                <input id="cp" className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <span className="field-label">Type</span>
            <div className="flex flex-wrap gap-1.5">
              {bookingTypes.filter((bt) => bt.appliesTo === 'both' || bt.appliesTo === kind).map((bt) => bt.name).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="tag"
                  style={bookingType === t ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                  onClick={() => setBookingType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="title">Title (shows on the schedule)</label>
            <input
              id="title" className="input" value={title} required
              placeholder={kind === 'internal' ? 'Bears U14 Rep - Practice' : 'Spring Tournament - XYZ Basketball'}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            <button type="button" className="btn-gold btn-sm" disabled={!whoValid} onClick={() => setStep(step + 1)}>Continue</button>
          </div>
        </section>
      )}

      {stepName === 'Fees' && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">Fees</h2>
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => {
              const f = facById.get(l.facilityId);
              const rate = lineRate(l);
              const total = lineTotal(l);
              return (
                <div key={i} className="flex flex-wrap items-end gap-2 border-b border-hairline pb-2 last:border-0">
                  <span className="min-w-44 flex-1 text-sm font-bold text-ink">
                    {f?.name}
                    <span className="ml-2 mono text-[11px] font-normal text-silver">{l.date} {l.start}–{l.end}</span>
                  </span>
                  <div>
                    <label className="field-label">Rate mode</label>
                    <select
                      className="input h-9 text-sm"
                      value={l.rateMode}
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, rateMode: e.target.value as LineDraft['rateMode'] } : x)))}
                    >
                      <option value="hourly">Hourly{f?.hourlyCents != null ? ` (${cad(f.hourlyCents)})` : ''}</option>
                      <option value="full_day">Full day{f?.fullDayCents != null ? ` (${cad(f.fullDayCents)})` : ''}</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Override $</label>
                    <input
                      type="number" min={0} step="0.01" placeholder={rate != null ? (rate / 100).toFixed(2) : 'no rate'}
                      className="input h-9 w-28 text-sm" value={l.rateOverride}
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, rateOverride: e.target.value } : x)))}
                    />
                  </div>
                  <span className="mono pb-2 text-sm">{total != null ? cad(total) : <span className="text-neg">no rate</span>}</span>
                </div>
              );
            })}
          </div>

          {addons.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-hairline pt-3">
              <span className="field-label">Add-ons</span>
              {addons.map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="min-w-44 flex-1">{a.name} <span className="text-silver">({cad(a.priceCents)} {a.pricingMode.replace('_', ' ')})</span></span>
                  <input
                    type="number" min={0} className="input h-8 w-20 text-sm"
                    value={addonQty[a.id] ?? 0}
                    onChange={(e) => setAddonQty({ ...addonQty, [a.id]: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
              ))}
            </div>
          )}

          <p className="mono border-t border-hairline pt-3 text-right text-sm">
            Subtotal {cad(feesTotal)} <span className="text-silver">(taxes on the quote)</span>
          </p>
          {missingRates && (
            <p className="text-sm text-neg">A line has no configured rate — set an override or add a rate card in Rental settings.</p>
          )}

          <div className="flex justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            <button type="button" className="btn-gold btn-sm" disabled={missingRates} onClick={() => setStep(step + 1)}>Continue</button>
          </div>
        </section>
      )}

      {stepName === 'Extras' && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">Extras</h2>
          <div>
            <label className="field-label" htmlFor="notes">Notes</label>
            <textarea id="notes" className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
            <input type="checkbox" checked={showPublic} onChange={(e) => setShowPublic(e.target.checked)} />
            Show on the public schedule
          </label>
          {kind === 'rental' && (
            <div className="max-w-40">
              <label className="field-label" htmlFor="dep">Deposit %</label>
              <input id="dep" type="number" min={0} max={100} className="input h-9 text-sm" value={depositPct} onChange={(e) => setDepositPct(e.target.value)} />
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <span className="field-label">Block other facilities during this booking</span>
            <p className="text-sm text-silver">
              Holds additional spaces as internal blocks (never billed, hidden from
              the public) — e.g. close the neighbouring court for a tournament.
            </p>
            {blocks.map((b, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-52 flex-1">
                  <label className="field-label">Facility</label>
                  <select className="input h-9 text-sm" value={b.facilityId}
                    onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, facilityId: Number(e.target.value) } : x)))}>
                    {facilityOptions}
                  </select>
                </div>
                <div>
                  <label className="field-label">Date</label>
                  <input type="date" className="input h-9 text-sm" value={b.date}
                    onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="field-label">Start</label>
                  <input type="time" className="input h-9 text-sm" value={b.start}
                    onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="field-label">End</label>
                  <input type="time" className="input h-9 text-sm" value={b.end}
                    onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                </div>
                <button type="button" className="btn-ghost btn-sm text-neg" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <div>
              <button
                type="button" className="btn-ghost btn-sm"
                onClick={() => setBlocks([...blocks, {
                  facilityId: facilities[0]?.id ?? 0,
                  date: lines[0]?.date ?? defaultDate,
                  start: lines[0]?.start ?? '',
                  end: lines[0]?.end ?? '',
                }])}
              >
                + Block a facility
              </button>
            </div>
          </div>

          <div className="flex justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            <button type="button" className="btn-gold btn-sm" disabled={!blocksValid} onClick={() => setStep(step + 1)}>Continue</button>
          </div>
        </section>
      )}

      {stepName === 'Review' && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">Review</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="label text-[10px]">Title</dt><dd className="font-bold text-ink">{title}</dd>
            <dt className="label text-[10px]">Kind</dt>
            <dd>{kind === 'internal'
              ? `Internal ($0) — ${businessUnits.find((u) => String(u.id) === businessUnitId)?.name ?? ''}`
              : `Rental — ${organizations.find((o) => String(o.id) === organizationId)?.name ?? (contactName || 'no contact set')}`}
            </dd>
            <dt className="label text-[10px]">Type</dt><dd>{bookingType}</dd>
            <dt className="label text-[10px]">Lines</dt>
            <dd className="flex flex-col gap-0.5">
              {lines.map((l, i) => (
                <span key={i} className="mono text-xs">
                  {facById.get(l.facilityId)?.name} · {l.date} {l.start}–{l.end}
                  {kind === 'rental' && lineTotal(l) != null ? ` · ${cad(lineTotal(l)!)}` : ''}
                </span>
              ))}
            </dd>
            {blocks.length > 0 && (
              <>
                <dt className="label text-[10px]">Blocked</dt>
                <dd className="flex flex-col gap-0.5">
                  {blocks.map((b, i) => (
                    <span key={i} className="mono text-xs">{facById.get(b.facilityId)?.name} · {b.date} {b.start}–{b.end}</span>
                  ))}
                </dd>
              </>
            )}
            {kind === 'rental' && <><dt className="label text-[10px]">Subtotal</dt><dd className="mono">{cad(feesTotal)}</dd></>}
            {showPublic && <><dt className="label text-[10px]">Public</dt><dd>Shows on the public schedule</dd></>}
            {notes && <><dt className="label text-[10px]">Notes</dt><dd>{notes}</dd></>}
          </dl>
          <p className="text-sm text-silver">
            {kind === 'rental'
              ? intent === 'quote'
                ? 'Lines are created as a tentative quote that holds the slots; any collision lands in the conflicts queue for you to resolve.'
                : 'Lines are booked CONFIRMED; the rental record carries the fees, and any collision lands in the conflicts queue.'
              : 'Lines are confirmed immediately at $0; any collision lands in the conflicts queue for you to resolve.'}
          </p>
          {error && <p className="text-sm text-neg">{error}</p>}
          <div className="flex justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            <button type="button" className="btn-gold" disabled={submitting} onClick={submit}>
              {submitting ? 'Booking…' : kind === 'rental' && intent === 'quote' ? 'Create quote & hold slots' : 'Book it'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
