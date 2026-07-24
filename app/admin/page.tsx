import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { ECOSYSTEM_LINKS } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * admin.athleteinstitute.ca home = the staff hub. Middleware confirmed a
 * session and the admin layout confirmed staff access; this links out to every
 * admin surface across all 22 modules, grouped by area.
 */
const GROUPS: Array<{ title: string; links: Array<{ href: string; label: string; desc: string }> }> = [
  {
    title: 'Programs & Registration',
    links: [
      { href: '/programs', label: 'Programs', desc: 'Build programs, types, questions, pricing, sessions' },
      { href: '/camps', label: 'Camps', desc: 'Weeks, capacity, check-in / check-out' },
      { href: '/club', label: 'Club', desc: 'Teams, tryout → offer → confirm pipeline' },
      { href: '/academy', label: 'Academy', desc: 'Recruitment offers, tuition, scholarships' },
      { href: '/competitive', label: 'Competitive Play', desc: 'Divisions, team builder, schedules, standings' },
    ],
  },
  {
    title: 'Facilities & Scheduling',
    links: [
      { href: '/schedule', label: 'Schedule', desc: 'Day / week / month booking views' },
      { href: '/facilities', label: 'Facilities', desc: 'Facility tree + bookable spaces' },
      { href: '/conflicts', label: 'Conflicts', desc: 'Booking conflict queue' },
      { href: '/rentals', label: 'Rentals', desc: 'Quotes, agreements, rates, settings' },
      { href: '/displays', label: 'TV Displays', desc: 'Public display screens + templates' },
    ],
  },
  {
    title: 'People & Staff',
    links: [
      { href: '/staff', label: 'Staff', desc: 'Records, capabilities, pay, certs' },
      { href: '/roles', label: 'Roles & Access', desc: 'Grant roles, staff by email' },
      { href: '/waivers', label: 'Waivers', desc: 'Waiver editor + versions' },
      { href: '/import', label: 'Playbook Import', desc: 'Import accounts from the Playbook export' },
    ],
  },
  {
    title: 'Engagement',
    links: [
      { href: '/comms', label: 'Communications', desc: 'Campaigns, announcements, auto-notifications' },
      { href: '/feedback', label: 'Feedback & Ratings', desc: 'Ratings, responses, AI summaries' },
      { href: '/points', label: 'Play Points', desc: 'Earn rules, referrals, liability' },
      { href: '/promotions', label: 'Promotions', desc: 'Contests, challenges, wheel, badges' },
      { href: '/gallery', label: 'Photo & Video', desc: 'Program galleries + uploads' },
    ],
  },
  {
    title: 'Business & Insight',
    links: [
      { href: '/reports', label: 'Dashboard & Reports', desc: 'Live dashboard, financials, QuickBooks' },
      { href: '/retention', label: 'Retention', desc: 'At-risk families + one-click actions' },
      { href: '/dunning', label: 'Dunning', desc: 'Failed-payment recovery + team explainer' },
      { href: '/assist', label: 'Assist (AI copilot)', desc: 'Ask org questions, navigate-to-spot' },
    ],
  },
];

export default async function AdminHome() {
  const session = await getPortalSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="flex flex-col gap-2">
          <p className="label text-[11px]">admin.athleteinstitute.ca</p>
          <h1 className="text-5xl">Staff backend<span style={{ color: 'var(--accent)' }}>.</span></h1>
        </div>
        <div className="card flex items-center gap-3 p-3">
          <UserButton />
          <div className="flex flex-col">
            <span className="text-sm text-ink">{session.email}</span>
            <span className="label text-[11px]">{session.roles.length ? session.roles.join(', ') : session.userType}</span>
          </div>
        </div>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 className="text-xl">{group.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.links.map((l) => (
              <Link key={l.href} href={l.href} className="card flex flex-col gap-1 p-4 transition-colors hover:border-[var(--accent)]">
                <span className="font-bold text-ink">{l.label}</span>
                <span className="text-xs text-silver">{l.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <footer className="flex flex-wrap gap-3 border-t border-hairline pt-6 text-sm">
        <span className="label text-[11px] self-center">Ecosystem:</span>
        <a href={ECOSYSTEM_LINKS.hub} className="btn-ghost btn-sm">Apps hub</a>
        <a href={process.env.NEXT_PUBLIC_PLAY_URL ?? '/'} className="btn-ghost btn-sm">Play portal (public)</a>
      </footer>
    </main>
  );
}
