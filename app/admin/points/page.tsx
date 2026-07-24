import { formatCAD as money } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { earnRules, pointsReport } from '@/lib/points/points';
import { clawbackAction, flagAction, grantAction, ruleAction } from './actions';

export const dynamic = 'force-dynamic';

/** Admin: Play Points (Module 19) - earn rules, referrals + fraud, reporting. */
export default async function PointsAdminPage() {
  const db = supabaseAdmin();
  const [rules, report, { data: referrals }] = await Promise.all([
    earnRules(),
    pointsReport(),
    db.from('referrals').select('id, status, flag_reason, created_at, referrer:families!referrals_referrer_family_id_fkey(name), referred:families!referrals_referred_family_id_fkey(name)').order('id', { ascending: false }).limit(20),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Play Points &amp; Referrals</p>
        <h1 className="text-3xl">Points<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3"><p className="label text-[10px]">Liability</p><p className="text-xl">{money(report.liabilityCents)}</p></div>
        <div className="card p-3"><p className="label text-[10px]">Earned all-time</p><p className="text-xl">{report.earnedTotal.toLocaleString()}</p></div>
        <div className="card p-3"><p className="label text-[10px]">Redeemed</p><p className="text-xl">{report.redeemedTotal.toLocaleString()}</p></div>
        <div className="card p-3"><p className="label text-[10px]">Referral conv.</p><p className="text-xl">{Math.round(report.referralConversion.rate * 100)}%</p></div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl">Earn rules</h2>
        {rules.map((r) => (
          <form key={r.rule_key} action={ruleAction} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
            <input type="hidden" name="ruleKey" value={r.rule_key} />
            <span className="grow font-bold text-ink">{r.label}{r.per_household_once && <span className="tag ml-2">once/household</span>}</span>
            <input name="points" type="number" min="0" defaultValue={r.points} className="input w-24" />
            <label className="flex items-center gap-1"><input type="checkbox" name="enabled" defaultChecked={r.enabled} /> On</label>
            <button className="btn-ghost btn-sm">Save</button>
          </form>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl">Referrals</h2>
        {(referrals ?? []).map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="grow text-body">{(r.referrer as unknown as { name: string } | null)?.name} → {(r.referred as unknown as { name: string } | null)?.name}</span>
            <span className="tag">{r.status}</span>
            {r.status === 'pending' && <form action={flagAction}><input type="hidden" name="referralId" value={r.id} /><input type="hidden" name="reason" value="staff review" /><button className="btn-ghost btn-sm">Flag</button></form>}
            {['rewarded', 'flagged'].includes(r.status) && (
              <form action={clawbackAction} className="flex items-center gap-1">
                <input type="hidden" name="referralId" value={r.id} />
                <input name="reason" placeholder="reason" required className="input w-32" />
                <button className="btn-ghost btn-sm">Claw back</button>
              </form>
            )}
          </div>
        ))}
        {(referrals ?? []).length === 0 && <p className="text-body text-sm">No referrals yet.</p>}
        {report.topReferrers.length > 0 && (
          <div className="card p-3 text-sm"><p className="field-label">Top referrers (internal)</p>{report.topReferrers.map((t) => <p key={t.familyName} className="flex justify-between"><span>{t.familyName}</span><span className="mono">{t.rewarded}</span></p>)}</div>
        )}
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-lg">Manual grant <span className="text-xs text-silver">(reason required, logged)</span></h2>
        <form action={grantAction} className="flex flex-wrap items-end gap-2">
          <div><label className="field-label">Family ID</label><input name="familyId" type="number" required className="input w-28 text-sm" /></div>
          <div><label className="field-label">Points (±)</label><input name="points" type="number" required className="input w-28 text-sm" /></div>
          <div className="grow"><label className="field-label">Reason</label><input name="reason" required className="input w-full text-sm" /></div>
          <button className="btn-gold btn-sm">Grant</button>
        </form>
      </section>
    </main>
  );
}
