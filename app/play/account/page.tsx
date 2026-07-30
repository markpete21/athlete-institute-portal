import Link from 'next/link';
import { formatCAD } from '@ai/foundation';
import { Icon } from '@/components/nav/icons';
import { getPortalSession } from '@/lib/auth';
import { accountView, type AttentionItem, type Member } from '@/lib/play/account';

export const dynamic = 'force-dynamic';

/**
 * The family account home (Play App). Hierarchy is deliberate:
 *   act → attend → owe → explore
 * "Needs your attention" is rendered FIRST and omitted entirely when empty, so
 * its presence alone means "do something". Then the two-week schedule spine,
 * with each child carried as a COLOUR rather than a filter, so the whole
 * household reads at once. Money and points sit in the sidebar.
 */
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });

function Avatar({ m, size = 24 }: { m: Member; size?: number }) {
  const style = { width: size, height: size, background: m.colour } as React.CSSProperties;
  return m.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.photoUrl} alt="" className="pa-av" style={{ width: size, height: size, borderColor: m.colour }} />
  ) : (
    <span className="pa-av pa-av-ini" style={style}>{m.initials}</span>
  );
}

const ATTN_ICON: Record<AttentionItem['kind'], string> = {
  payment: 'card', waiver: 'waivers', jersey: 'warn', consent: 'gallery', waitlist: 'programs',
};

export default async function AccountHome() {
  const session = await getPortalSession();

  if (!session.userId) {
    return (
      <main className="pa-wrap">
        <div className="pa-head"><p className="label text-[11px]">Welcome</p><h1 className="pa-h1">Your family account<span className="pa-dot">.</span></h1></div>
        <p className="text-body">
          <Link href="/sign-in" className="pa-inline-link">Sign in</Link> to see your schedule, registrations and balance.
        </p>
      </main>
    );
  }

  const view = await accountView(session.familyId, 14);
  const byId = new Map(view.members.map((m) => [m.id, m]));

  return (
    <main className="pa-wrap">
      <div className="pa-head">
        <div>
          <p className="label text-[11px]">Household</p>
          <h1 className="pa-h1">{view.familyName ?? 'Your family'}<span className="pa-dot">.</span></h1>
        </div>
        <div className="pa-head-actions">
          <Link href="/account/members" className="btn-ghost btn-sm">Manage household</Link>
          <Link href="/programs" className="btn-gold btn-sm">Register for a program</Link>
        </div>
      </div>

      {/* 1 · ACT — absent entirely when there's nothing to do */}
      {view.attention.length > 0 && (
        <section className="pa-attn">
          <div className="pa-attn-head">
            <b>Needs your attention</b>
            <span className="label text-[10px]">{view.attention.length} item{view.attention.length === 1 ? '' : 's'}</span>
          </div>
          {view.attention.map((a, i) => {
            const who = a.memberId ? byId.get(a.memberId) : null;
            return (
              <div key={i} className="pa-attn-item">
                {who ? <Avatar m={who} size={26} /> : <span className="pa-attn-spacer" />}
                <span className="pa-attn-ic" style={{ color: a.urgent ? 'var(--accent)' : 'var(--ps-silver)' }}>
                  <Icon name={ATTN_ICON[a.kind]} size={18} />
                </span>
                <span className="pa-attn-txt"><b>{a.title}</b><span>{a.detail}</span></span>
                <Link href={a.href} className={a.urgent ? 'btn-gold btn-sm' : 'btn-ghost btn-sm'}>{a.cta}</Link>
              </div>
            );
          })}
        </section>
      )}

      {/* the colour key — children are a colour, not a filter */}
      {view.members.length > 0 && (
        <div className="pa-roster">
          {view.members.map((m) => (
            <Link key={m.id} href="/account/members" className="pa-kid" style={{ ['--ck' as string]: m.colour }}>
              <Avatar m={m} size={30} />
              <span className="pa-kid-nm">
                <b>{m.firstName}</b>
                <span>{m.photoUrl ? 'photo set' : 'add photo'}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="pa-grid">
        <div>
          {/* 2 · ATTEND — the two-week spine */}
          <div className="pa-sec-head">
            <h2 className="pa-h2">Next two weeks</h2>
            <Link href="/schedule" className="label text-[10px]" style={{ color: 'var(--accent)' }}>Full schedule →</Link>
          </div>

          {view.days.every((d) => d.sessions.length === 0) ? (
            <p className="pa-empty">
              Nothing scheduled in the next two weeks. <Link href="/programs" className="pa-inline-link">Browse programs</Link>.
            </p>
          ) : (
            <div className="pa-spine">
              {view.days.map((d) => (
                <div key={d.date} className={`pa-day${d.isToday ? ' today' : ''}`}>
                  <div className="pa-dcol">
                    <span>{d.weekday}</span>
                    <b>{d.dayNum}</b>
                    <em>{d.month}</em>
                  </div>
                  <div className="pa-slots">
                    {d.sessions.length === 0 ? (
                      <p className="pa-free">Nothing scheduled</p>
                    ) : d.sessions.map((s) => {
                      const who = s.memberId ? byId.get(s.memberId) : null;
                      return (
                        <div key={`${s.bookingId}-${s.startsAt}`} className="pa-slot" style={{ ['--ck' as string]: who?.colour ?? 'var(--ps-silver)' }}>
                          <span className="pa-t">{timeOf(s.startsAt)}</span>
                          <span className="pa-m">
                            <b>{s.title}</b>
                            {s.facility && <span>{s.facility}</span>}
                          </span>
                          {s.isGame && <span className="tag text-[10px]">Game</span>}
                          {who && <Avatar m={who} size={24} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* registrations */}
          <div className="pa-sec-head" style={{ marginTop: 30 }}>
            <h2 className="pa-h2">Registrations</h2>
            <span className="pa-note">{view.registrations.length} active</span>
          </div>
          {view.registrations.length === 0 ? (
            <p className="pa-empty">No registrations yet.</p>
          ) : (
            <div>
              {view.registrations.map((r) => {
                const who = r.memberId ? byId.get(r.memberId) : null;
                return (
                  <div key={r.id} className="pa-reg" style={{ ['--ck' as string]: who?.colour ?? 'var(--ps-silver)' }}>
                    {who && <Avatar m={who} size={24} />}
                    <span className="pa-m">
                      <b>{r.programName}</b>
                      <span>{[who?.firstName, r.seasonKey].filter(Boolean).join(' · ') || ' '}</span>
                    </span>
                    <span className="tag text-[10px]">
                      {r.status === 'waitlisted' ? `Waitlist · ${r.waitlistPosition ?? '—'}` : 'Active'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3 · OWE */}
        <aside className="pa-aside">
          <section>
            <div className="pa-sec-head"><h2 className="pa-h2">Balance</h2></div>
            <div className="card pa-panel">
              <div>
                <p className="label text-[10px]">Owing now</p>
                <p className="pa-big">{formatCAD(view.balance.owedCents)}</p>
              </div>
              {view.balance.totalCount > 0 && (
                <>
                  <div className="pa-bar">
                    <i style={{ width: `${Math.round((view.balance.paidCount / view.balance.totalCount) * 100)}%` }} />
                  </div>
                  <p className="pa-note">Payment plan · {view.balance.paidCount} of {view.balance.totalCount} paid</p>
                </>
              )}
              {view.balance.nextDueDate && (
                <div className="pa-kv">
                  <span>Next payment</span>
                  <b>{formatCAD(view.balance.nextDueCents)} · {new Date(`${view.balance.nextDueDate}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</b>
                </div>
              )}
              {view.balance.creditCents > 0 && (
                <div className="pa-kv"><span>Credit on account</span><b>{formatCAD(view.balance.creditCents)}</b></div>
              )}
              {view.balance.owedCents === 0 && <p className="pa-note">Nothing owing — you&apos;re all paid up.</p>}
            </div>
          </section>

          <section>
            <div className="pa-sec-head"><h2 className="pa-h2">Play Points</h2></div>
            <div className="card pa-panel">
              <div className="pa-points-row">
                <span className="pa-big">{view.points.balance.toLocaleString('en-CA')}</span>
                <span className="pa-note">≈ {formatCAD(view.points.balance)}</span>
              </div>
              <Link href="/points" className="btn-ghost btn-sm">Points &amp; referrals</Link>
              <p className="pa-note">Points work across every Athlete Institute app.</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
