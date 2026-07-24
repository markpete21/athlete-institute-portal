import Link from 'next/link';
import { formatCAD as money } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import {
  capacityAlerts, collectedVsOutstanding, collectionsForecast, discountsBreakdown,
  outstandingBalances, paymentPlanHealth, revenueSummary, topProgramsByRegistration,
  topProgramsByRevenue,
} from '@/lib/reports/reports';
import { qboAuthUrl, qboStatus } from '@/lib/quickbooks/qbo';
import type { Period } from '@ai/foundation';

export const dynamic = 'force-dynamic';

const PERIODS: Period[] = ['24h', '7d', '30d', '3mo', '1yr'];

/**
 * Admin: landing dashboard + financial suite (Module 14). Financials are
 * ADMIN-only (M5 matrix) - non-admin staff see the registration surfaces only.
 */
export default async function ReportsPage({ searchParams }: { searchParams: { period?: string } }) {
  const session = await getPortalSession();
  const isAdmin = session.roles.some((r) => /admin/i.test(r)) || session.userType === 'staff';
  const period = (PERIODS.includes(searchParams.period as Period) ? searchParams.period : '30d') as Period;

  const [topReg, topRev, alerts, upcoming, rentals] = await Promise.all([
    topProgramsByRegistration(period, { limit: 8 }),
    topProgramsByRevenue(period, { limit: 8 }),
    capacityAlerts(),
    supabaseAdmin().from('program_sessions').select('id, starts_at, programs(name)').gte('starts_at', new Date().toISOString()).order('starts_at').limit(5),
    supabaseAdmin().from('bookings').select('id, title, starts_at, source').is('canceled_at', null).in('source', ['rental', 'event']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(5),
  ]);
  const financials = isAdmin
    ? await Promise.all([outstandingBalances(), collectedVsOutstanding(), paymentPlanHealth(), discountsBreakdown(), collectionsForecast(), revenueSummary('location'), qboStatus()])
    : null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-10">
      <header className="flex items-end justify-between border-b border-hairline pb-4">
        <div><p className="label text-[11px]">Dashboard &amp; Reporting</p><h1 className="text-3xl">Reports<span style={{ color: 'var(--accent)' }}>.</span></h1></div>
        <nav className="flex gap-1">
          {PERIODS.map((p) => (
            <Link key={p} href={`/reports?period=${p}`} className={`btn-ghost btn-sm ${p === period ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}>{p}</Link>
          ))}
        </nav>
      </header>

      {alerts.length > 0 && (
        <section className="card border-l-2 border-[var(--accent)] p-4">
          <p className="field-label">Capacity alerts</p>
          {alerts.map((a) => (
            <p key={a.programId} className="text-sm text-body">{a.name} — <span className="font-bold">{a.level.replace('_', ' ')}</span> ({a.active}{a.capacity ? `/${a.capacity}` : ''}{a.waitlisted ? `, ${a.waitlisted} waitlisted` : ''})</p>
          ))}
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-4">
          <p className="field-label">Top programs by registration ({period})</p>
          {topReg.length === 0 && <p className="text-sm text-body">No registrations in this period.</p>}
          {topReg.map((t) => {
            const max = topReg[0]?.count || 1;
            return (
              <div key={t.programId} className="mt-2">
                <div className="flex justify-between text-sm"><span className="text-ink">{t.name}</span><span className="mono">{t.count}</span></div>
                <div className="h-1.5 bg-[#eee]"><div className="h-full" style={{ width: `${(t.count / max) * 100}%`, background: 'var(--accent)' }} /></div>
              </div>
            );
          })}
        </div>
        <div className="card p-4">
          <p className="field-label">Top programs by revenue ({period})</p>
          {topRev.map((t) => {
            const max = topRev[0]?.revenueCents || 1;
            return (
              <div key={t.programId} className="mt-2">
                <div className="flex justify-between text-sm"><span className="text-ink">{t.name}</span><span className="mono">{money(t.revenueCents)}</span></div>
                <div className="h-1.5 bg-[#eee]"><div className="h-full" style={{ width: `${(t.revenueCents / max) * 100}%`, background: 'var(--accent)' }} /></div>
              </div>
            );
          })}
        </div>
        <div className="card p-4">
          <p className="field-label">Upcoming program sessions</p>
          {(upcoming.data ?? []).map((s) => <p key={s.id} className="flex justify-between text-sm"><span className="text-ink">{(s.programs as unknown as { name: string } | null)?.name ?? 'Program'}</span><span className="mono">{new Date(s.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' })}</span></p>)}
          {(upcoming.data ?? []).length === 0 && <p className="text-sm text-body">None scheduled.</p>}
        </div>
        <div className="card p-4">
          <p className="field-label">Upcoming rentals &amp; events</p>
          {(rentals.data ?? []).map((b) => <p key={b.id} className="flex justify-between text-sm"><span className="text-ink">{b.title}</span><span className="mono">{new Date(b.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' })}</span></p>)}
          {(rentals.data ?? []).length === 0 && <p className="text-sm text-body">None booked.</p>}
        </div>
      </section>

      {financials ? (
        <FinancialSuite data={financials} />
      ) : (
        <p className="text-body text-sm">Financial reports are admin-only.</p>
      )}
    </main>
  );
}

function FinancialSuite({ data }: { data: Awaited<ReturnType<typeof loadFinancials>> }) {
  const [outstanding, cvo, health, discounts, forecast, byLocation, qbo] = data;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl">Financial suite <span className="tag ml-2">admin-only</span></h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3"><p className="label text-[10px]">Collected</p><p className="text-xl">{money(cvo.collectedCents)}</p></div>
        <div className="card p-3"><p className="label text-[10px]">Outstanding</p><p className="text-xl">{money(cvo.outstandingCents)}</p></div>
        <div className="card p-3"><p className="label text-[10px]">Plans behind</p><p className="text-xl">{health.behind + health.defaulted}</p></div>
        <div className="card p-3"><p className="label text-[10px]">$ at risk</p><p className="text-xl">{money(health.atRiskCents)}</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <p className="field-label">Aging (overdue)</p>
          {Object.entries({ Current: outstanding.aging.current, '1-30d': outstanding.aging.d1_30, '31-60d': outstanding.aging.d31_60, '61-90d': outstanding.aging.d61_90, '90d+': outstanding.aging.d90plus }).map(([k, v]) => (
            <p key={k} className="flex justify-between text-sm"><span className="text-silver">{k}</span><span className="mono">{money(v)}</span></p>
          ))}
        </div>
        <div className="card p-4">
          <p className="field-label">Discounts breakdown</p>
          {Object.entries(discounts).map(([k, v]) => <p key={k} className="flex justify-between text-sm"><span className="text-silver">{k.replace(/Cents$/, '')}</span><span className="mono">{money(v as number)}</span></p>)}
        </div>
        <div className="card p-4">
          <p className="field-label">Collections forecast</p>
          {forecast.slice(0, 6).map((f) => <p key={f.month} className="flex justify-between text-sm"><span className="text-silver">{f.month}</span><span className="mono">{money(f.expectedCents)}</span></p>)}
          {forecast.length === 0 && <p className="text-sm text-body">No pending installments.</p>}
        </div>
        <div className="card p-4">
          <p className="field-label">Revenue by location</p>
          {byLocation.map((c) => <p key={c.key} className="flex justify-between text-sm"><span className="text-silver">{c.key}</span><span className="mono">{money(c.revenueCents)}</span></p>)}
          {byLocation.length === 0 && <p className="text-sm text-body">No revenue recorded.</p>}
        </div>
      </div>
      <div className="card flex items-center justify-between p-4">
        <div><p className="field-label">QuickBooks</p><p className="text-sm text-body">{qbo.connected ? `Connected (realm ${qbo.realmId}) · last sync ${qbo.lastSyncAt ?? 'never'}` : 'Not connected — expense pull + margin use the cached table until OAuth is set up.'}</p></div>
        {!qbo.connected && qboAuthUrlSafe() && <a href={qboAuthUrlSafe()!} className="btn-gold btn-sm">Connect QBO</a>}
      </div>
    </section>
  );
}

// Typed helper mirrors of the async loads (server component convenience).
async function loadFinancials() {
  return Promise.all([outstandingBalances(), collectedVsOutstanding(), paymentPlanHealth(), discountsBreakdown(), collectionsForecast(), revenueSummary('location'), qboStatus()]);
}
function qboAuthUrlSafe(): string | null { try { return qboAuthUrl(); } catch { return null; } }
