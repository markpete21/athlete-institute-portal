'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { DatesPicker } from './DatesPicker';
import { bookWizardAction, quickAddOrgAction, type WizardPayload, type WizardResult } from './actions';

/** Required-field feedback: red border once a submit/continue was attempted. */
const invalid = (bad: boolean): React.CSSProperties | undefined =>
  bad ? { borderColor: '#b4483c' } : undefined;

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
  repeatMode: 'none' | 'weekly' | 'dates';
  repeatUntil: string;      // weekly: last date (inclusive)
  repeatDates: string[];    // dates: extra specific dates
  /** Add-ons for THIS block: addonId -> qty (applied to every occurrence). */
  addons: Record<number, number>;
}

const NO_REPEAT = { repeatMode: 'none' as const, repeatUntil: '', repeatDates: [] as string[], addons: {} as Record<number, number> };

/** How many bookings a line will create (weekly = same weekday, inclusive). */
function lineOccurrences(l: LineDraft): number {
  if (l.repeatMode === 'weekly' && /^\d{4}-\d{2}-\d{2}$/.test(l.repeatUntil) && l.repeatUntil > l.date) {
    const days = (Date.parse(`${l.repeatUntil}T12:00:00Z`) - Date.parse(`${l.date}T12:00:00Z`)) / 86400_000;
    return Math.floor(days / 7) + 1;
  }
  if (l.repeatMode === 'dates') return 1 + l.repeatDates.length;
  return 1;
}

interface BlockDraft {
  facilityId: number;
  date: string;
  start: string;
  end: string;
}

const cad = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Business-day walking (weekends skipped) for the payment-schedule defaults.
const shiftBusinessDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const HST = 0.13;

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
  noFacility = false,
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
  /** Quote-only: start with zero facility lines (assign them later). */
  noFacility?: boolean;
  defaultDate: string;
  prefillSlots: Array<{ facilityId: number; start: string; end: string }>;
  prefillFacilities: number[];
}) {
  const facById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);

  const [step, setStep] = useState(1);
  const [lines, setLines] = useState<LineDraft[]>(() => {
    const fromSlots = prefillSlots.map((s) => ({
      facilityId: s.facilityId, date: defaultDate, start: s.start, end: s.end,
      rateMode: 'hourly' as const, rateOverride: '', ...NO_REPEAT,
    }));
    const fromFacilities = prefillFacilities.map((id) => ({
      facilityId: id, date: defaultDate, start: '', end: '',
      rateMode: 'hourly' as const, rateOverride: '', ...NO_REPEAT,
    }));
    const drafts = [...fromSlots, ...fromFacilities];
    if (drafts.length) return drafts;
    if (noFacility) return [];
    return [{ facilityId: facilities[0]?.id ?? 0, date: defaultDate, start: '', end: '', rateMode: 'hourly', rateOverride: '', ...NO_REPEAT }];
  });

  // A quote is by definition a priced customer hold - internal is not offered.
  const [kind, setKind] = useState<'internal' | 'rental'>(intent === 'quote' ? 'rental' : 'internal');
  const [title, setTitle] = useState('');
  const [bookingType, setBookingType] = useState('');
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [orgs, setOrgs] = useState(organizations);
  const [orgModal, setOrgModal] = useState(false);
  const [orgDraft, setOrgDraft] = useState({ name: '', repName: '', repEmail: '', repPhone: '' });
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSaving, setOrgSaving] = useState(false);
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [pickerLine, setPickerLine] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [depositPct, setDepositPct] = useState('25');
  // Payment schedule defaults: deposit 5 business days out; balance 10
  // business days before the earliest booked date (never in the past).
  const [depositDue, setDepositDue] = useState(() => shiftBusinessDays(todayISO(), 5));
  const [balanceDue, setBalanceDue] = useState('');
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [sendInvoice, setSendInvoice] = useState(true);
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [showPublic, setShowPublic] = useState(false);
  const [setupMinutes, setSetupMinutes] = useState(0);
  const [cleanupMinutes, setCleanupMinutes] = useState(0);
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WizardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const zeroLinesOk = intent === 'quote' && kind === 'rental';
  const linesValid = (lines.length > 0 || zeroLinesOk) && lines.every(
    (l) =>
      l.facilityId && l.date && /^\d{2}:\d{2}$/.test(l.start) && /^\d{2}:\d{2}$/.test(l.end) && l.end > l.start
      && (l.repeatMode !== 'weekly' || (/^\d{4}-\d{2}-\d{2}$/.test(l.repeatUntil) && l.repeatUntil > l.date))
      && (l.repeatMode !== 'dates' || l.repeatDates.length > 0),
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
  // Mirror of the server's addonTotalCents: per_hour prices off the block's
  // hours (qty ignored), per_unit multiplies, flat is flat.
  const lineAddonTotal = (l: LineDraft): number =>
    addons.reduce((sum, a) => {
      const qty = l.addons[a.id] ?? 0;
      if (qty <= 0) return sum;
      if (a.pricingMode === 'flat') return sum + a.priceCents;
      if (a.pricingMode === 'per_unit') return sum + a.priceCents * qty;
      return sum + Math.round(a.priceCents * hoursBetween(l.start, l.end));
    }, 0);
  const feesTotal = kind === 'rental'
    ? lines.reduce((sum, l) => sum + ((lineTotal(l) ?? 0) + lineAddonTotal(l)) * lineOccurrences(l), 0)
      + addons.reduce((sum, a) => sum + (addonQty[a.id] ?? 0) * a.priceCents, 0)
    : 0;
  const missingRates = kind === 'rental' && lines.some((l) => lineRate(l) == null);

  const earliestDate = lines.map((l) => l.date).filter(Boolean).sort()[0] ?? null;
  // Balance default: 10 business days before the first booking (never past);
  // with no facility attached yet, 20 business days out as a placeholder.
  const balanceDefault = (() => {
    if (!earliestDate) return shiftBusinessDays(todayISO(), 20);
    const d = shiftBusinessDays(earliestDate, -10);
    return d < todayISO() ? todayISO() : d;
  })();
  const effBalanceDue = balanceTouched && balanceDue ? balanceDue : balanceDefault;
  const totalWithTax = Math.round(feesTotal * (1 + HST));
  const depositCents = Math.round((totalWithTax * (Number(depositPct) || 25)) / 100);

  const steps = kind === 'internal'
    ? ['When & where', 'Who & What', 'Extras', 'Review']
    : ['When & where', 'Who & What', 'Fees', 'Extras', 'Review & send'];
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
      depositDue: kind === 'rental' ? depositDue : undefined,
      balanceDue: kind === 'rental' ? effBalanceDue : undefined,
      sendInvoice: kind === 'rental' && sendInvoice && contactEmail.trim() !== '',
      notes,
      showPublic,
      setupMinutes,
      cleanupMinutes,
      lines: lines.map((l) => ({
        facilityId: l.facilityId, date: l.date, start: l.start, end: l.end,
        rateMode: l.rateMode,
        unitRateCents: l.rateOverride !== '' ? Math.round(Number(l.rateOverride) * 100) : null,
        repeat:
          l.repeatMode === 'weekly'
            ? { mode: 'weekly' as const, until: l.repeatUntil }
            : l.repeatMode === 'dates'
              ? { mode: 'dates' as const, dates: l.repeatDates }
              : undefined,
        addons: Object.entries(l.addons).map(([id, qty]) => ({ addonId: Number(id), qty })).filter((a) => a.qty > 0),
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
        {result.scheduleNote && (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-silver">Payments: {result.scheduleNote}</p>
        )}
        {result.sendNote && (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: result.sendNote.startsWith('sent') ? 'var(--accent)' : '#b4483c' }}>
            Invoice: {result.sendNote}
          </p>
        )}
        {result.quoteUrl && (
          <p className="text-sm text-body">
            Customer link (view &amp; pay): <code className="mono break-all text-xs">{result.quoteUrl}</code>
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
            className={i + 1 === step ? 'pill-status gold' : 'tag'}
            style={i + 1 < step ? { color: 'var(--ink, #1e1e1e)' } : undefined}
          >
            {i + 1} · {s}
          </li>
        ))}
      </ol>

      {stepName === 'When & where' && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">When &amp; where</h2>
          {lines.length === 0 && (
            <p className="card border-l-4 p-3 text-sm text-body" style={{ borderLeftColor: 'var(--accent)' }}>
              <b>No facility attached.</b> This quote prices the work first —
              assign facilities and dates any time later from the rental screen.
            </p>
          )}
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
                    style={invalid(!!attempted[1] && !/^\d{2}:\d{2}$/.test(l.start))}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="field-label">End</label>
                  <input type="time" className="input h-9 text-sm" value={l.end}
                    style={invalid(!!attempted[1] && (!/^\d{2}:\d{2}$/.test(l.end) || (!!l.start && !!l.end && l.end <= l.start)))}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                </div>
                <div>
                  <label className="field-label">Repeat</label>
                  <select
                    className="input h-9 text-sm"
                    value={l.repeatMode}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, repeatMode: e.target.value as LineDraft['repeatMode'] } : x)))}
                  >
                    <option value="none">One time</option>
                    <option value="weekly">Weekly until…</option>
                    <option value="dates">Specific dates</option>
                  </select>
                </div>
                {l.repeatMode === 'weekly' && (
                  <div>
                    <label className="field-label">Until (incl.)</label>
                    <input
                      type="date" className="input h-9 text-sm" value={l.repeatUntil} min={l.date}
                      style={invalid(!!attempted[1] && !(l.repeatUntil > l.date))}
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, repeatUntil: e.target.value } : x)))}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="btn-ghost btn-sm text-neg"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  disabled={lines.length === 1 && !zeroLinesOk}
                >
                  Remove
                </button>
                {l.repeatMode === 'dates' && (
                  <div className="flex w-full flex-wrap items-center gap-2 pl-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver">Also on:</span>
                    {l.repeatDates.map((d) => (
                      <span key={d} className="tag">
                        {d}
                        <button
                          type="button" className="ml-1 text-silver hover:text-neg" title="Remove date"
                          onClick={() => setLines(lines.map((x, j) => (j === i ? { ...x, repeatDates: x.repeatDates.filter((y) => y !== d) } : x)))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      style={invalid(!!attempted[1] && l.repeatDates.length === 0)}
                      onClick={() => setPickerLine(i)}
                    >
                      {l.repeatDates.length ? 'Edit dates…' : 'Pick dates…'}
                    </button>
                  </div>
                )}
                {lineOccurrences(l) > 1 && (
                  <span className="w-full pl-1 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--accent)' }}>
                    {lineOccurrences(l)} bookings
                  </span>
                )}
              </div>
            ))}
          </div>
          <div>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setLines([
                ...lines,
                lines.length
                  ? { ...lines[lines.length - 1], rateOverride: '', ...NO_REPEAT }
                  : { facilityId: facilities[0]?.id ?? 0, date: defaultDate, start: '', end: '', rateMode: 'hourly', rateOverride: '', ...NO_REPEAT },
              ])}
            >
              + Add another facility / time
            </button>
          </div>
          {attempted[1] && !linesValid && (
            <p className="text-sm text-neg">Every line needs a facility, date, and a start before its end — the highlighted fields are missing or wrong.</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-gold btn-sm"
              onClick={() => (linesValid ? setStep(step + 1) : setAttempted({ ...attempted, 1: true }))}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {stepName === 'Who & What' && (
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
              <label className="field-label" htmlFor="bu">Business unit</label>
              <select id="bu" className="input" value={businessUnitId} style={invalid(!!attempted[2] && businessUnitId === '')} onChange={(e) => setBusinessUnitId(e.target.value)}>
                <option value="">Select…</option>
                {businessUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="org">Organization (optional)</label>
                <div className="flex gap-2">
                  <select id="org" className="input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                    <option value="">—</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => { setOrgError(null); setOrgModal(true); }}>
                    + Quick add
                  </button>
                </div>
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
            <span className="field-label" style={attempted[2] && !bookingType ? { color: '#b4483c' } : undefined}>Type</span>
            <div className="flex flex-wrap gap-1.5">
              {bookingTypes.filter((bt) => bt.appliesTo === 'both' || bt.appliesTo === kind).map((bt) => bt.name).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={bookingType === t ? 'pill-status gold' : 'tag'}
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
              style={invalid(!!attempted[2] && title.trim() === '')}
              placeholder={kind === 'internal' ? 'Bears U14 Rep - Practice' : 'Spring Tournament - XYZ Basketball'}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {attempted[2] && !whoValid && (
            <p className="text-sm text-neg">
              Fill the highlighted fields{kind === 'internal' && businessUnitId === '' ? ' (business unit required)' : ''}{!bookingType ? ' and pick a type' : ''}.
            </p>
          )}
          <div className="flex justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            <button
              type="button"
              className="btn-gold btn-sm"
              onClick={() => (whoValid ? setStep(step + 1) : setAttempted({ ...attempted, 2: true }))}
            >
              Continue
            </button>
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
                  <span className="mono pb-2 text-sm">
                    {total != null
                      ? lineOccurrences(l) > 1
                        ? `${cad(total)} × ${lineOccurrences(l)} = ${cad(total * lineOccurrences(l))}`
                        : cad(total)
                      : <span className="text-neg">no rate</span>}
                  </span>

                  {addons.length > 0 && (
                    <details className="w-full pl-1">
                      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-silver">
                        Add-ons for this block
                        {lineAddonTotal(l) > 0 && (
                          <span className="ml-2 normal-case tracking-normal" style={{ color: 'var(--accent)' }}>
                            {cad(lineAddonTotal(l))}
                            {lineOccurrences(l) > 1 ? ` × ${lineOccurrences(l)} = ${cad(lineAddonTotal(l) * lineOccurrences(l))}` : ''}
                          </span>
                        )}
                      </summary>
                      <div className="flex flex-col gap-1.5 pt-2">
                        {addons.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 text-sm">
                            <span className="min-w-44 flex-1">
                              {a.name} <span className="text-silver">({cad(a.priceCents)} {a.pricingMode.replace('_', ' ')})</span>
                            </span>
                            <input
                              type="number" min={0} className="input h-8 w-20 text-sm"
                              value={l.addons[a.id] ?? 0}
                              onChange={(e) =>
                                setLines(lines.map((x, j) =>
                                  j === i ? { ...x, addons: { ...x.addons, [a.id]: Math.max(0, Number(e.target.value)) } } : x,
                                ))
                              }
                            />
                          </div>
                        ))}
                        <p className="text-xs text-silver">
                          Attached to this time block{lineOccurrences(l) > 1 ? ' — applied to every occurrence' : ''};
                          per-hour add-ons price off the block&apos;s hours.
                        </p>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>

          {addons.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-hairline pt-3">
              <span className="field-label">General add-ons (whole quote)</span>
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
            Subtotal {cad(feesTotal)} <span className="text-silver">· with HST {cad(totalWithTax)}</span>
          </p>

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <span className="field-label">Payment schedule</span>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-24">
                <label className="field-label" htmlFor="dep-pct">Deposit %</label>
                <input id="dep-pct" type="number" min={0} max={100} className="input h-9 text-sm"
                  value={depositPct} onChange={(e) => setDepositPct(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="dep-due">Deposit due</label>
                <input id="dep-due" type="date" className="input h-9 text-sm"
                  value={depositDue} onChange={(e) => setDepositDue(e.target.value)} />
              </div>
              <span className="mono pb-2 text-sm text-body">{cad(depositCents)}</span>
              <div>
                <label className="field-label" htmlFor="bal-due">Balance due</label>
                <input id="bal-due" type="date" className="input h-9 text-sm"
                  value={effBalanceDue}
                  onChange={(e) => { setBalanceTouched(true); setBalanceDue(e.target.value); }} />
              </div>
              <span className="mono pb-2 text-sm text-body">{cad(Math.max(0, totalWithTax - depositCents))}</span>
            </div>
            <p className="text-sm text-silver">
              Defaults: {Number(depositPct) || 25}% deposit due 5 business days from
              today, balance due 10 business days before the first booking.
              {intent === 'quote'
                ? ' The schedule activates when the quote is marked booked.'
                : ' Installments are created on booking; invoices with a payment link go out on each due date.'}
            </p>
          </div>
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

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <span className="field-label">Setup &amp; cleanup buffers</span>
            <p className="text-sm text-silver">
              Minutes held either side of every time block. Buffered time counts
              as occupied, so nobody gets booked on top of the setup or teardown
              — the published times stay exactly as entered.
            </p>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="field-label" htmlFor="wiz-setup">Setup before (min)</label>
                <input
                  id="wiz-setup" type="number" min={0} max={480} step={5} className="input w-36"
                  value={setupMinutes}
                  onChange={(e) => setSetupMinutes(Math.max(0, Math.min(480, Number(e.target.value) || 0)))}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="wiz-cleanup">Cleanup after (min)</label>
                <input
                  id="wiz-cleanup" type="number" min={0} max={480} step={5} className="input w-36"
                  value={cleanupMinutes}
                  onChange={(e) => setCleanupMinutes(Math.max(0, Math.min(480, Number(e.target.value) || 0)))}
                />
              </div>
            </div>
          </div>

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

          {attempted[4] && !blocksValid && (
            <p className="text-sm text-neg">Each blocked facility needs a date and a start before its end.</p>
          )}
          <div className="flex justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            <button
              type="button"
              className="btn-gold btn-sm"
              onClick={() => (blocksValid ? setStep(step + 1) : setAttempted({ ...attempted, 4: true }))}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {pickerLine !== null && lines[pickerLine] && (
        <DatesPicker
          open
          onClose={() => setPickerLine(null)}
          initial={lines[pickerLine].repeatDates}
          baseDate={lines[pickerLine].date}
          onSubmit={(dates) =>
            setLines(lines.map((x, j) => (j === pickerLine ? { ...x, repeatDates: dates.filter((d) => d !== x.date) } : x)))
          }
        />
      )}

      <Modal open={orgModal} onClose={() => setOrgModal(false)} title="Quick add organization">
        <div className="flex flex-col gap-3">
          <div>
            <label className="field-label" htmlFor="qa-name">Organization name</label>
            <input id="qa-name" className="input" value={orgDraft.name} required
              style={invalid(!!orgError && orgDraft.name.trim() === '')}
              onChange={(e) => setOrgDraft({ ...orgDraft, name: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="qa-rep">Representative name</label>
              <input id="qa-rep" className="input" value={orgDraft.repName}
                onChange={(e) => setOrgDraft({ ...orgDraft, repName: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="qa-email">Rep email (invoicing)</label>
              <input id="qa-email" type="email" className="input" value={orgDraft.repEmail}
                onChange={(e) => setOrgDraft({ ...orgDraft, repEmail: e.target.value })} />
            </div>
          </div>
          <div className="max-w-56">
            <label className="field-label" htmlFor="qa-phone">Rep phone</label>
            <input id="qa-phone" className="input" value={orgDraft.repPhone}
              onChange={(e) => setOrgDraft({ ...orgDraft, repPhone: e.target.value })} />
          </div>
          <p className="text-sm text-silver">
            The representative needs no account — name and email drive quotes
            and invoicing. An account can be linked to them later.
          </p>
          {orgError && <p className="text-sm text-neg">{orgError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOrgModal(false)}>Cancel</button>
            <button
              type="button" className="btn-gold btn-sm" disabled={orgSaving}
              onClick={async () => {
                if (!orgDraft.name.trim()) { setOrgError('Organization name is required.'); return; }
                setOrgSaving(true);
                setOrgError(null);
                try {
                  const org = await quickAddOrgAction(orgDraft);
                  setOrgs([...orgs, org].sort((a, b) => a.name.localeCompare(b.name)));
                  setOrganizationId(String(org.id));
                  if (!contactName && orgDraft.repName) setContactName(orgDraft.repName);
                  if (!contactEmail && orgDraft.repEmail) setContactEmail(orgDraft.repEmail);
                  setOrgDraft({ name: '', repName: '', repEmail: '', repPhone: '' });
                  setOrgModal(false);
                } catch (e) {
                  setOrgError(e instanceof Error ? e.message : String(e));
                } finally {
                  setOrgSaving(false);
                }
              }}
            >
              {orgSaving ? 'Adding…' : 'Add organization'}
            </button>
          </div>
        </div>
      </Modal>

      {(stepName === 'Review' || stepName === 'Review & send') && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">{stepName}</h2>
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
              {lines.length === 0 && <span className="text-xs text-silver">No facility yet — assign on the rental screen.</span>}
              {lines.map((l, i) => (
                <span key={i} className="mono text-xs">
                  {facById.get(l.facilityId)?.name} · {l.date} {l.start}–{l.end}
                  {l.repeatMode === 'weekly' ? ` · weekly until ${l.repeatUntil} (${lineOccurrences(l)}×)` : ''}
                  {l.repeatMode === 'dates' ? ` · +${l.repeatDates.length} more date${l.repeatDates.length === 1 ? '' : 's'}` : ''}
                  {kind === 'rental' && lineTotal(l) != null ? ` · ${cad((lineTotal(l)! + lineAddonTotal(l)) * lineOccurrences(l))}` : ''}
                  {kind === 'rental' && lineAddonTotal(l) > 0 ? ' (incl. add-ons)' : ''}
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
            {kind === 'rental' && <><dt className="label text-[10px]">Total</dt><dd className="mono">{cad(totalWithTax)} incl. HST</dd></>}
            {kind === 'rental' && (
              <>
                <dt className="label text-[10px]">Payments</dt>
                <dd className="flex flex-col gap-0.5">
                  <span className="mono text-xs">Deposit ({Number(depositPct) || 25}%) {cad(depositCents)} · due {depositDue}</span>
                  <span className="mono text-xs">Balance {cad(Math.max(0, totalWithTax - depositCents))} · due {effBalanceDue}</span>
                </dd>
              </>
            )}
            {showPublic && <><dt className="label text-[10px]">Public</dt><dd>Shows on the public schedule</dd></>}
            {(setupMinutes > 0 || cleanupMinutes > 0) && (
              <>
                <dt className="label text-[10px]">Buffers</dt>
                <dd>{setupMinutes}m setup &middot; {cleanupMinutes}m cleanup (held, not billed)</dd>
              </>
            )}
            {notes && <><dt className="label text-[10px]">Notes</dt><dd>{notes}</dd></>}
          </dl>
          <p className="text-sm text-silver">
            {kind === 'rental'
              ? intent === 'quote'
                ? 'Lines are created as a tentative quote that holds the slots; any collision lands in the conflicts queue for you to resolve.'
                : 'Lines are booked CONFIRMED; the rental record carries the fees, and any collision lands in the conflicts queue.'
              : 'Lines are confirmed immediately at $0; any collision lands in the conflicts queue for you to resolve.'}
          </p>
          {kind === 'rental' && (
            <label className="flex items-center gap-2 border-t border-hairline pt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
              <input type="checkbox" checked={sendInvoice} onChange={(e) => setSendInvoice(e.target.checked)} />
              Email the {intent === 'quote' ? 'quote' : 'invoice'} with a link to view &amp; pay
              {contactEmail.trim() ? ` → ${contactEmail}` : ''}
            </label>
          )}
          {kind === 'rental' && sendInvoice && !contactEmail.trim() && (
            <p className="text-sm text-neg">No contact email set (step 2) — nothing can be sent.</p>
          )}
          {error && <p className="text-sm text-neg">{error}</p>}
          <div className="flex justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            <button type="button" className="btn-gold" disabled={submitting} onClick={submit}>
              {submitting
                ? 'Booking…'
                : kind === 'rental' && intent === 'quote'
                  ? sendInvoice && contactEmail.trim() ? 'Create quote & send' : 'Create quote & hold slots'
                  : kind === 'rental' && sendInvoice && contactEmail.trim() ? 'Book & send invoice' : 'Book it'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
