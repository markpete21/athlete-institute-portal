import Link from 'next/link';
import { TIMEZONE, formatCAD, torontoInstant, torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { Icon } from '@/components/nav/icons';
import { getPortalSession } from '@/lib/auth';
import type { BookingRecord } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

/**
 * admin.athleteinstitute.ca home (2026-08 redesign). Navigation lives in the
 * persistent AdminShell rail, so this is a working overview: a KPI band led by
 * revenue, the monthly revenue chart, today's bookings with the conflict
 * queue, and the latest registrations.
 */

const RANGES = { '7': 7, '30': 30, '90': 90 } as const;
type RangeKey = keyof typeof RANGES;

const CHART_MONTHS = 8;

const monthKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit' });
const monthLabelFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, month: 'short' });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, day: 'numeric', month: 'short' });
const kickerFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, weekday: 'short' });

const fmtK = (cents: number) => {
  const dollars = cents / 100;
  return dollars >= 1000 ? `${Math.round(dollars / 1000)}K` : String(Math.round(dollars));
};

function agoLabel(iso: string, now: number): string {
  const mins = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} d ago`;
}

/** Calendar-date shift (YYYY-MM-DD), pure string math via UTC noon. */
const shiftDate = (dateISO: string, days: number) =>
  new Date(Date.parse(`${dateISO}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

interface RegRow { line_total_cents: number | null; created_at: string }

async function overview(days: number) {
  const db = supabaseAdmin();
  const now = Date.now();
  const since = new Date(now - days * 86_400_000).toISOString();
  const prevSince = new Date(now - 2 * days * 86_400_000).toISOString();

  // Chart window: the first day of the month CHART_MONTHS-1 months back.
  const [curYear, curMonth] = monthKeyFmt.format(new Date(now)).split('-').map(Number);
  const firstMonth = new Date(Date.UTC(curYear, curMonth - 1 - (CHART_MONTHS - 1), 1));
  const chartSince = torontoInstant(firstMonth.toISOString().slice(0, 10), '00:00');

  const today = torontoToday();
  const dayFrom = torontoInstant(today, '00:00');
  const dayTo = torontoInstant(shiftDate(today, 1), '00:00');

  // Conflicts are computed live from the booking set (there is no stored
  // table), so ask the Module 2 engine for the upcoming fortnight.
  const { findConflictPairs } = await import('@/lib/conflicts');

  const [cur, prev, progs, chart, conflicts, todays, latest] = await Promise.all([
    db.from('registrations').select('line_total_cents, created_at').gte('created_at', since).in('status', ['active', 'waitlisted']),
    db.from('registrations').select('line_total_cents, created_at').gte('created_at', prevSince).lt('created_at', since).in('status', ['active', 'waitlisted']),
    db.from('programs').select('id', { count: 'exact', head: true }).in('status', ['published', 'registration_open']),
    db.from('registrations').select('line_total_cents, created_at').gte('created_at', chartSince).in('status', ['active', 'waitlisted']),
    findConflictPairs(new Date(now).toISOString(), new Date(now + 14 * 86_400_000).toISOString()),
    db.from('bookings').select('id, title, starts_at, ends_at, status, facility_id').is('canceled_at', null).gte('starts_at', dayFrom).lt('starts_at', dayTo).order('starts_at').limit(4),
    db.from('registrations')
      .select('id, line_total_cents, created_at, status, programs(name), family_members(first_name, last_name)')
      .in('status', ['active', 'waitlisted'])
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const sum = (rows: RegRow[] | null) => (rows ?? []).reduce((a, r) => a + (r.line_total_cents ?? 0), 0);
  const curRows = (cur.data ?? []) as RegRow[];
  const prevRows = (prev.data ?? []) as RegRow[];

  const pct = (c: number, p: number) => (p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null);

  // Bucket chart rows into calendar months (Toronto wall time).
  const buckets: Array<{ key: string; label: string; cents: number; current: boolean }> = [];
  for (let i = CHART_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(curYear, curMonth - 1 - i, 15));
    const key = monthKeyFmt.format(d);
    buckets.push({ key, label: monthLabelFmt.format(d), cents: 0, current: i === 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const r of (chart.data ?? []) as RegRow[]) {
    const b = byKey.get(monthKeyFmt.format(new Date(r.created_at)));
    if (b) b.cents += r.line_total_cents ?? 0;
  }

  // Facility names for today's bookings.
  const bookings = (todays.data ?? []) as Array<Pick<BookingRecord, 'id' | 'title' | 'starts_at' | 'ends_at' | 'status' | 'facility_id'>>;
  const facIds = Array.from(new Set(bookings.map((b) => b.facility_id)));
  const facNames = new Map<number, string>();
  if (facIds.length) {
    const { data: fac } = await db.from('facilities').select('id, name, label').in('id', facIds);
    for (const f of fac ?? []) facNames.set(f.id, (f.label || f.name) as string);
  }

  return {
    revenueCents: sum(curRows),
    revenueDelta: pct(sum(curRows), sum(prevRows)),
    regs: curRows.length,
    regsDelta: pct(curRows.length, prevRows.length),
    openPrograms: progs.count ?? 0,
    openConflicts: conflicts.length,
    months: buckets,
    bookings,
    facNames,
    latest: (latest.data ?? []) as unknown as Array<{
      id: number;
      line_total_cents: number | null;
      created_at: string;
      status: string;
      programs: { name: string } | null;
      family_members: { first_name: string; last_name: string } | null;
    }>,
  };
}

function DeltaChip({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null || pct === 0) return <span className="chip-delta flat">—</span>;
  const up = pct > 0;
  const good = invert ? !up : up;
  return (
    <span className={`chip-delta ${good ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

export default async function AdminHome({ searchParams }: { searchParams?: { range?: string } }) {
  const session = await getPortalSession();
  const rangeKey: RangeKey = (searchParams?.range && searchParams.range in RANGES ? searchParams.range : '30') as RangeKey;
  const days = RANGES[rangeKey];
  const data = await overview(days).catch(() => null);
  const firstName = session.email?.split('@')[0]?.split('.')[0] ?? 'there';
  const now = Date.now();
  const today = torontoToday();

  const maxCents = data ? Math.max(1, ...data.months.map((m) => m.cents)) : 1;
  const hotKey = data ? data.months.reduce((a, b) => (b.cents > a.cents ? b : a)).key : '';

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-7 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="label text-[11px]">Overview · {kickerFmt.format(new Date(now))}</p>
          <h1 className="text-4xl capitalize">
            Welcome back, {firstName}<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <nav className="seg" aria-label="Stats range">
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <Link key={k} href={k === '30' ? '/' : `/?range=${k}`} className={k === rangeKey ? 'on' : ''}>
                {{ '7': 'Week', '30': 'Month', '90': 'Quarter' }[k]}
              </Link>
            ))}
          </nav>
          <span className="range-chip">
            <Icon name="schedule" size={13} />
            {dayFmt.format(new Date(now - days * 86_400_000))} – {dayFmt.format(new Date(now))}
          </span>
        </div>
      </header>

      {data && (
        <>
          {/* KPI band — revenue leads on the ink hero card */}
          <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
            <div className="card-ink kpi">
              <p className="kpi-k">Revenue · {days}d</p>
              <p className="kpi-v">{formatCAD(data.revenueCents)}</p>
              <p className="kpi-d"><DeltaChip pct={data.revenueDelta} /> vs previous {days} days</p>
            </div>
            <div className="card kpi">
              <p className="kpi-k">Registrations · {days}d</p>
              <p className="kpi-v">{data.regs}</p>
              <p className="kpi-d"><DeltaChip pct={data.regsDelta} /> vs previous {days} days</p>
            </div>
            <div className="card kpi">
              <p className="kpi-k">Open programs</p>
              <p className="kpi-v">{data.openPrograms}</p>
              <p className="kpi-d">published or open for registration</p>
            </div>
            <div className="card kpi">
              <p className="kpi-k">Open conflicts</p>
              <p className="kpi-v">{data.openConflicts}</p>
              <p className="kpi-d">
                {data.openConflicts > 0
                  ? <span className="chip-delta down">Needs review</span>
                  : <span className="chip-delta up">All clear</span>}
              </p>
            </div>
          </section>

          {/* chart + today's schedule */}
          <section className="grid items-stretch gap-4 lg:grid-cols-[1.9fr_1fr]">
            <div className="card p-5">
              <div className="card-head">
                <h2>Revenue</h2>
                <span className="card-head-lbl">Registrations · monthly</span>
              </div>
              <div className="adm-chart">
                <div className="adm-yaxis">
                  <span>{fmtK(maxCents)}</span>
                  <span>{fmtK(Math.round(maxCents / 2))}</span>
                  <span>0</span>
                </div>
                <div className="adm-bars">
                  {data.months.map((m) => (
                    <div key={m.key} className={`adm-bar${m.key === hotKey && m.cents > 0 ? ' hot' : ''}${m.current ? ' now' : ''}`}>
                      <i style={{ height: `${Math.max(2, Math.round((m.cents / maxCents) * 100))}%` }}>
                        {m.key === hotKey && m.cents > 0 && <span className="adm-tip">{formatCAD(m.cents)}</span>}
                      </i>
                      <b>{m.label}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="card-head">
                <h2>Today</h2>
                <Link href="/schedule" className="card-head-lbl">Full schedule →</Link>
              </div>
              <div className="adm-daystrip">
                {[-3, -2, -1, 0, 1, 2, 3].map((off) => {
                  const d = shiftDate(today, off);
                  const noon = new Date(`${d}T12:00:00Z`);
                  return (
                    <div key={d} className={`adm-day${off === 0 ? ' today' : ''}`}>
                      <span>{weekdayFmt.format(noon).slice(0, 2)}</span>
                      <b>{Number(d.slice(8, 10))}</b>
                    </div>
                  );
                })}
              </div>
              {data.bookings.length === 0 && (
                <p className="adm-slot" style={{ color: 'var(--op-silver)', fontSize: 12.5 }}>No bookings today.</p>
              )}
              {data.bookings.map((b) => (
                <Link key={b.id} href={`/schedule/booking/${b.id}`} className={`adm-slot${b.status === 'tentative' ? ' tentative' : ''}`}>
                  <span className="adm-slot-t">{timeFmt.format(new Date(b.starts_at))}</span>
                  <span className="adm-slot-mark" />
                  <span className="adm-slot-what">
                    <b>{b.title || 'Booking'}</b>
                    <span>
                      {data.facNames.get(b.facility_id) ?? 'Facility'}
                      {b.status === 'tentative' ? ' · tentative' : ''}
                    </span>
                  </span>
                </Link>
              ))}
              {data.openConflicts > 0 ? (
                <Link href="/conflicts" className="adm-alert">
                  <span><b>{data.openConflicts} conflict{data.openConflicts === 1 ? '' : 's'}</b> in the next 14 days</span>
                  <span className="adm-alert-go">Resolve →</span>
                </Link>
              ) : (
                <p className="adm-alert clear">
                  <span><b>No conflicts</b> in the next 14 days</span>
                </p>
              )}
            </div>
          </section>

          {/* latest registrations */}
          <section className="card p-5">
            <div className="card-head">
              <h2>Latest registrations</h2>
              <Link href="/reports" className="card-head-lbl">Reports →</Link>
            </div>
            {data.latest.length === 0 ? (
              <p className="mt-3 text-sm text-silver">No registrations yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Athlete</th>
                      <th>Amount</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latest.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="flex items-center gap-3 font-bold text-ink">
                            <span className="icon-tile"><Icon name="programs" size={16} /></span>
                            {r.programs?.name ?? '—'}
                          </span>
                        </td>
                        <td>{r.family_members ? `${r.family_members.first_name} ${r.family_members.last_name}` : '—'}</td>
                        <td className="mono text-[13px]">{formatCAD(r.line_total_cents ?? 0)}</td>
                        <td className="mono text-[12px] text-silver">{agoLabel(r.created_at, now)}</td>
                        <td>
                          {r.status === 'waitlisted'
                            ? <span className="pill-status gold">Waitlist</span>
                            : <span className="pill-status ink">Active</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <p className="text-sm text-body">
        Everything else is in the menu on the left — pin your regulars to the favourites bar with the pin icon,
        and pin up to three programs to keep their numbers on screen.
      </p>
    </main>
  );
}
