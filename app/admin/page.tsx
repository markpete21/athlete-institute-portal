import Link from 'next/link';
import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { Icon } from '@/components/nav/icons';
import { getPortalSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * admin.athleteinstitute.ca home. Navigation lives in the persistent AdminShell
 * rail, so this is a working landing view: today's shape of the business plus
 * the handful of things staff most often start from.
 */
async function counts() {
  const db = supabaseAdmin();
  const now = Date.now();
  const since = new Date(now - 7 * 86_400_000).toISOString();
  // Conflicts are computed live from the booking set (there is no stored table),
  // so ask the Module 2 engine for the upcoming fortnight.
  const { findConflictPairs } = await import('@/lib/conflicts');
  const [progs, regs, conflicts] = await Promise.all([
    db.from('programs').select('id', { count: 'exact', head: true }).in('status', ['published', 'registration_open']),
    db.from('registrations').select('line_total_cents, created_at').gte('created_at', since).in('status', ['active', 'waitlisted']),
    findConflictPairs(new Date(now).toISOString(), new Date(now + 14 * 86_400_000).toISOString()),
  ]);
  const rows = regs.data ?? [];
  return {
    openPrograms: progs.count ?? 0,
    weekRegs: rows.length,
    weekRevenueCents: rows.reduce((a, r) => a + (r.line_total_cents ?? 0), 0),
    openConflicts: conflicts.length,
  };
}

const QUICK = [
  { href: '/programs', icon: 'programs', label: 'Programs', desc: 'Build and open registration' },
  { href: '/schedule', icon: 'schedule', label: 'Schedule', desc: 'Bookings across every space' },
  { href: '/reports', icon: 'reports', label: 'Reports', desc: 'Financials and dashboards' },
  { href: '/comms', icon: 'comms', label: 'Communications', desc: 'Campaigns and announcements' },
];

export default async function AdminHome() {
  const session = await getPortalSession();
  const c = await counts().catch(() => null);
  const firstName = session.email?.split('@')[0]?.split('.')[0] ?? 'there';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-9 px-7 py-9">
      <header className="flex flex-col gap-1">
        <p className="label text-[11px]">Overview</p>
        <h1 className="text-4xl capitalize">
          Welcome back, {firstName}<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
      </header>

      {c && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Open programs', v: String(c.openPrograms) },
            { k: 'Registrations · 7d', v: String(c.weekRegs) },
            { k: 'Revenue · 7d', v: formatCAD(c.weekRevenueCents) },
            { k: 'Open conflicts', v: String(c.openConflicts) },
          ].map((s) => (
            <div key={s.k} className="card p-4">
              <p className="label text-[10px]">{s.k}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{s.v}</p>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Jump back in</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className="card flex flex-col gap-2 p-4 transition-colors hover:border-[var(--accent)]">
              <span style={{ color: 'var(--accent)' }}><Icon name={q.icon} size={20} /></span>
              <span className="font-bold text-ink">{q.label}</span>
              <span className="text-xs text-silver">{q.desc}</span>
            </Link>
          ))}
        </div>
        <p className="text-body text-sm">
          Everything else is in the menu on the left — pin your regulars to the favourites bar with the pin icon,
          and pin up to three programs to keep their 7-day numbers on screen.
        </p>
      </section>
    </main>
  );
}
