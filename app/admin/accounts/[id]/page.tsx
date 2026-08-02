import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatCAD } from '@ai/foundation';
import { accountDetail, searchAccounts } from '@/lib/accounts/admin';
import { effectiveTypeSettings } from '@/lib/type-settings';
import { setAccountTypeAction } from '../actions';
import { ACCOUNT_TYPES } from '../types';
import {
  adjustCreditAction,
  adjustPointsAction,
  adminShareDependentAction,
  mergeIntoThisAction,
  resendClaimAction,
  setAccountStatusAction,
  setStaffCreditCapAction,
  updateAccountSettingsAction,
} from './actions';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  hoh: 'Head of Household', secondary: 'Secondary parent', dependent: 'Dependent', adult: 'Adult member',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Account detail — the front-desk view of one account: household, programs,
 * money, balances, roles, claim state, and the audit-log activity timeline.
 */
export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { mq?: string; merged?: string };
}) {
  const profileId = Number(params.id);
  if (!Number.isInteger(profileId)) notFound();
  const d = await accountDetail(profileId);
  if (!d) notFound();
  const { profile } = d;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || `Account #${profile.id}`;
  const unclaimed = !!profile.claim_token && !profile.claimed_at;
  const mergeQuery = (searchParams.mq ?? '').trim();
  const mergeResults = mergeQuery ? await searchAccounts(mergeQuery, profileId) : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-hairline pb-5">
        <p className="label text-[11px]">
          <Link href="/accounts" className="hover:text-ink">Admin · Accounts</Link> · Detail
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">{name}<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <span className="tag">{ACCOUNT_TYPES.find((t) => t.value === profile.user_type)?.label ?? profile.user_type}</span>
          <span className="tag" style={profile.status !== 'active' ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>{profile.status}</span>
          {d.isHoh && <span className="tag">HoH</span>}
          {d.roles.map((r) => <span key={r} className="tag">{r}</span>)}
          {unclaimed && <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>Unclaimed import</span>}
        </div>
        <p className="text-body">
          <span className="mono text-xs">{profile.email ?? 'no email'}</span>
          {profile.phone && <span className="mono text-xs"> · {profile.phone}</span>}
          {profile.imported_from && <span className="mono text-xs"> · {profile.imported_from}</span>}
        </p>
        {searchParams.merged && (
          <p className="text-sm" style={{ color: 'var(--accent)' }}>
            Merged account #{searchParams.merged} into this one. Check the household below for duplicate members to tidy.
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-8">
          {/* Household */}
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl">Household{d.family ? ` — ${d.family.name}` : ''}</h2>
            {!d.family ? (
              <p className="text-sm text-silver">No household yet — created on their first sign-in.</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>Name</th><th>Access</th><th>DOB</th><th>Email</th><th>Households</th></tr></thead>
                <tbody>
                  {d.family.members.map((m) => (
                    <tr key={m.id}>
                      <td className="text-ink">{m.first_name} {m.last_name}</td>
                      <td><span className="tag">{ROLE_LABEL[m.member_role]}</span></td>
                      <td className="mono">{m.dob ?? '—'}</td>
                      <td className="mono text-xs">{m.email ?? '—'}</td>
                      <td>
                        {m.second_family_id
                          ? <span className="tag" title={`Also in family #${m.family_id === d.family!.id ? m.second_family_id : m.family_id}`}>Dual-household</span>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.family && d.family.members.some((m) => m.member_role === 'dependent' && !m.second_family_id) && (
              <details>
                <summary className="label text-[10px] cursor-pointer">Link a dependent to a second household (divorced/separated parents)</summary>
                <form action={adminShareDependentAction} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="profileId" value={profile.id} />
                  <div>
                    <label className="field-label" htmlFor="shareMember">Dependent</label>
                    <select id="shareMember" name="memberId" className="input h-9 text-sm">
                      {d.family.members.filter((m) => m.member_role === 'dependent' && !m.second_family_id).map((m) => (
                        <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-56">
                    <label className="field-label" htmlFor="shareEmail">Other parent&apos;s account email</label>
                    <input id="shareEmail" name="targetEmail" type="email" required className="input h-9 text-sm" />
                  </div>
                  <button type="submit" className="btn-gold btn-sm">Link households</button>
                </form>
              </details>
            )}
          </section>

          {/* Registrations */}
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl">Registrations</h2>
            {d.registrations.length === 0 ? (
              <p className="text-sm text-silver">None.</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>Program</th><th>Member</th><th>Season</th><th>Status</th></tr></thead>
                <tbody>
                  {d.registrations.map((r) => (
                    <tr key={r.id}>
                      <td className="text-ink">{r.programName}</td>
                      <td>{r.memberName ?? '—'}</td>
                      <td className="mono">{r.seasonKey ?? '—'}</td>
                      <td><span className="tag">{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Payments */}
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl">Payments</h2>
            {!d.outstanding || d.outstanding.orders.length === 0 ? (
              <p className="text-sm text-silver">No program orders.</p>
            ) : (
              <>
                <p className="text-sm">
                  Owing <strong className="mono">{formatCAD(d.outstanding.owedCents)}</strong>
                  {d.outstanding.overdueCents > 0 && (
                    <span style={{ color: 'var(--accent)' }}> · {formatCAD(d.outstanding.overdueCents)} overdue</span>
                  )}
                </p>
                <table className="data-table">
                  <thead><tr><th>Order</th><th>Programs</th><th>Progress</th><th>Owing</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.outstanding.orders.map((o) => (
                      <tr key={o.orderId}>
                        <td className="mono">#{o.orderId}</td>
                        <td className="text-ink">{o.programNames.join(', ') || '—'}</td>
                        <td className="mono">{o.paidCount}/{o.totalCount} paid</td>
                        <td className="mono">{formatCAD(o.owedCents)}</td>
                        <td><span className="tag">{o.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          {/* Activity */}
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl">Activity</h2>
            {d.timeline.length === 0 ? (
              <p className="text-sm text-silver">Nothing recorded yet.</p>
            ) : (
              <div className="flex flex-col">
                {d.timeline.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline py-2">
                    <span className="mono text-xs text-silver" style={{ minWidth: 150 }}>{when(t.at)}</span>
                    <span className="text-sm text-ink">{t.action}</span>
                    <span className="mono text-xs text-silver">{t.target}</span>
                    <span className="mono text-xs text-silver">by {t.actor.startsWith('user_') ? 'staff' : t.actor}</span>
                    {Object.keys(t.meta).length > 0 && (
                      <span className="mono text-[11px] text-silver" style={{ overflowWrap: 'anywhere' }}>{JSON.stringify(t.meta)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6">
          <section className="card flex flex-col gap-3 p-5">
            <h3 className="text-lg">Account</h3>
            <form action={setAccountTypeAction} className="flex items-end gap-2">
              <input type="hidden" name="profileId" value={profile.id} />
              <div className="flex-1">
                <label className="field-label" htmlFor="type">Type</label>
                <select id="type" name="userType" defaultValue={profile.user_type} className="input h-9 text-sm">
                  {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-ghost btn-sm">Save</button>
            </form>
            <form action={setAccountStatusAction} className="flex items-end gap-2">
              <input type="hidden" name="profileId" value={profile.id} />
              <div className="flex-1">
                <label className="field-label" htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={profile.status} className="input h-9 text-sm">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended — can pay, cannot register</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <button type="submit" className="btn-ghost btn-sm">Save</button>
            </form>
            {unclaimed && (
              <form action={resendClaimAction}>
                <input type="hidden" name="profileId" value={profile.id} />
                <button type="submit" className="btn-ghost btn-sm">Re-send claim email</button>
              </form>
            )}
            <p className="text-xs text-silver">
              Roles are granted on <Link href="/roles" className="underline hover:text-ink">Roles &amp; Access</Link>.
            </p>
          </section>

          {d.family && (
            <section className="card flex flex-col gap-3 p-5">
              <h3 className="text-lg">Balances</h3>
              <div className="flex justify-between text-sm"><span>Play Points</span><b className="mono">{d.pointsBalance.toLocaleString('en-CA')}</b></div>
              <div className="flex justify-between text-sm"><span>Credit on account</span><b className="mono">{formatCAD(d.creditBalanceCents)}</b></div>
              <details>
                <summary className="label text-[10px] cursor-pointer">Adjust credit</summary>
                <form action={adjustCreditAction} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input type="hidden" name="familyId" value={d.family.id} />
                  <input name="deltaDollars" type="number" step="0.01" placeholder="+/- dollars" required className="input h-9 text-sm" />
                  <input name="reason" placeholder="Reason (required)" required className="input h-9 text-sm" />
                  <button type="submit" className="btn-gold btn-sm">Apply</button>
                </form>
              </details>
              <details>
                <summary className="label text-[10px] cursor-pointer">Adjust points</summary>
                <form action={adjustPointsAction} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input type="hidden" name="familyId" value={d.family.id} />
                  <input name="deltaPoints" type="number" step="1" placeholder="+/- points" required className="input h-9 text-sm" />
                  <input name="reason" placeholder="Reason (required)" required className="input h-9 text-sm" />
                  <button type="submit" className="btn-gold btn-sm">Apply</button>
                </form>
              </details>
              {(d.creditLedger.length > 0 || d.pointsLedger.length > 0) && (
                <details>
                  <summary className="label text-[10px] cursor-pointer">Recent ledger</summary>
                  <div className="mt-2 flex flex-col gap-1">
                    {d.creditLedger.map((r) => (
                      <p key={`c${r.id}`} className="mono text-[11px]">{when(r.at)} · credit {r.delta > 0 ? '+' : ''}{formatCAD(r.delta)} · {r.reason}</p>
                    ))}
                    {d.pointsLedger.map((r) => (
                      <p key={`p${r.id}`} className="mono text-[11px]">{when(r.at)} · points {r.delta > 0 ? '+' : ''}{r.delta} · {r.reason}</p>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {d.staffCredit && (
            <section className="card flex flex-col gap-3 p-5">
              <h3 className="text-lg">Staff credit</h3>
              <div className="flex justify-between text-sm"><span>Season</span><b className="mono">{d.staffCredit.seasonKey}</b></div>
              <div className="flex justify-between text-sm"><span>Balance</span><b className="mono">{formatCAD(d.staffCredit.balanceCents)}</b></div>
              <div className="flex justify-between text-sm">
                <span>Cap</span>
                <b className="mono">{formatCAD(d.staffCredit.capCents)}{d.staffCredit.hasOverride ? ' (override)' : ' (default)'}</b>
              </div>
              <form action={setStaffCreditCapAction} className="flex items-end gap-2">
                <input type="hidden" name="profileId" value={profile.id} />
                <div className="flex-1">
                  <label className="field-label" htmlFor="cap">Cap override ($, blank = default {formatCAD(d.staffCredit.defaultCapCents)})</label>
                  <input id="cap" name="capDollars" type="number" step="0.01" min="0" className="input h-9 text-sm"
                    defaultValue={d.staffCredit.hasOverride ? (d.staffCredit.capCents / 100).toFixed(2) : ''} />
                </div>
                <button type="submit" className="btn-ghost btn-sm">Save</button>
              </form>
              <p className="text-xs text-silver">Tops up TO the cap each season, spendable at checkout by their household. Never on rentals.</p>
            </section>
          )}

          <section className="card flex flex-col gap-3 p-5">
            <h3 className="text-lg">Settings</h3>
            <form action={updateAccountSettingsAction} className="flex flex-col gap-2">
              <input type="hidden" name="profileId" value={profile.id} />
              <input type="hidden" name="userType" value={profile.user_type} />
              {profile.user_type === 'organization' && (
                <div>
                  <label className="field-label" htmlFor="terms">Invoice terms (days)</label>
                  <input id="terms" name="invoiceTermsDays" type="number" min="0" max="365" className="input h-9 text-sm"
                    defaultValue={effectiveTypeSettings('organization', profile.settings).invoiceTermsDays} />
                </div>
              )}
              {profile.user_type === 'customer' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="marketingOptIn"
                    defaultChecked={effectiveTypeSettings('customer', profile.settings).marketingOptIn} />
                  Marketing emails opt-in (CASL)
                </label>
              )}
              {profile.user_type === 'staff' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="staffDiscountsEnabled"
                    defaultChecked={effectiveTypeSettings('staff', profile.settings).staffDiscountsEnabled} />
                  Staff discounts enabled
                </label>
              )}
              {profile.user_type === 'tenant' && (
                <div>
                  <label className="field-label" htmlFor="areas">Schedule areas (comma-separated, blank = all)</label>
                  <input id="areas" name="scheduleAreas" className="input h-9 text-sm"
                    defaultValue={effectiveTypeSettings('tenant', profile.settings).scheduleAreas.join(', ')} />
                </div>
              )}
              <button type="submit" className="btn-ghost btn-sm">Save settings</button>
            </form>
          </section>

          <section className="card flex flex-col gap-3 p-5">
            <h3 className="text-lg">Merge a duplicate into this account</h3>
            <p className="text-xs text-silver">
              Post-import duplicates: everything (household, registrations, money,
              balances, roles) moves here; the duplicate is archived and any old
              login lands on this account.
            </p>
            <form method="get" action={`/accounts/${profile.id}`} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="field-label" htmlFor="mq">Find the duplicate</label>
                <input id="mq" name="mq" defaultValue={mergeQuery} placeholder="Name or email…" className="input h-9 text-sm" />
              </div>
              <button type="submit" className="btn-ghost btn-sm">Search</button>
            </form>
            {mergeQuery && mergeResults.length === 0 && <p className="text-sm text-silver">No matches.</p>}
            {mergeResults.map((r) => (
              <form key={r.id} action={mergeIntoThisAction} className="flex items-center justify-between gap-2 border-t border-hairline pt-2">
                <input type="hidden" name="profileId" value={profile.id} />
                <input type="hidden" name="sourceProfileId" value={r.id} />
                <span className="text-sm">
                  <span className="text-ink">{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</span>
                  <span className="mono text-xs text-silver"> {r.email ?? 'no email'} · #{r.id}</span>
                </span>
                <button type="submit" className="btn-gold btn-sm">Merge in</button>
              </form>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
