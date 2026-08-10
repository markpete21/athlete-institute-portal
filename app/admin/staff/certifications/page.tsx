import Link from 'next/link';
import { torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listCertTypes } from '@/lib/staff/staff';
import { createCertTypeAction, toggleCertTypeAction, updateCertTypeAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Certification catalog (Module 5): the org-wide list of certifications
 * staff can hold. Programs pick from this catalog when setting which certs
 * each role needs (program builder → Required certifications); a staff
 * member's held/outstanding status derives from those requirements.
 */
export default async function CertificationsPage() {
  const db = supabaseAdmin();
  const today = torontoToday();
  const [types, { data: held }, { data: reqs }] = await Promise.all([
    listCertTypes(true),
    db.from('staff_certifications').select('cert_type_id, expires_on, staff(status)'),
    db.from('program_role_certifications').select('cert_type_id'),
  ]);

  const stats = new Map<number, { valid: number; expired: number; requiredBy: number }>();
  for (const t of types) stats.set(t.id, { valid: 0, expired: 0, requiredBy: 0 });
  for (const h of held ?? []) {
    if (!h.cert_type_id || (h.staff as unknown as { status: string } | null)?.status === 'archived') continue;
    const s = stats.get(h.cert_type_id);
    if (!s) continue;
    if (h.expires_on && h.expires_on < today) s.expired++;
    else s.valid++;
  }
  for (const r of reqs ?? []) {
    const s = stats.get(r.cert_type_id);
    if (s) s.requiredBy++;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-6">
        <div>
          <p className="label text-[11px]">Admin · Staff</p>
          <h1 className="text-5xl">Certifications<span style={{ color: 'var(--accent)' }}>.</span></h1>
          <p className="text-body mt-2 max-w-3xl">
            The org-wide catalog. Each program picks which of these its roles need (program page → Required
            certifications); anything required-but-not-held shows as outstanding on the staff list. Expiry warns —
            it never blocks an assignment.
          </p>
        </div>
        <Link href="/staff" className="btn-ghost btn-sm">← Staff</Link>
      </header>

      <div className="flex flex-col gap-4">
        {types.map((t) => {
          const s = stats.get(t.id)!;
          return (
            <div key={t.id} className={`card flex flex-col gap-3 p-5 ${t.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl">{t.name}</h2>
                {!t.active && <span className="tag">inactive</span>}
                <span className="ml-auto flex gap-2 text-sm">
                  <span className="tag" style={{ color: '#3f7a5b', borderColor: '#3f7a5b' }}>{s.valid} valid</span>
                  {s.expired > 0 && <span className="tag" style={{ color: '#b4483c', borderColor: '#b4483c' }}>{s.expired} expired</span>}
                  <span className="tag">required by {s.requiredBy} role{s.requiredBy === 1 ? '' : 's'}</span>
                </span>
              </div>
              <form action={updateCertTypeAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="certTypeId" value={t.id} />
                <div className="min-w-64 flex-1">
                  <label className="field-label" htmlFor={`desc-${t.id}`}>Description</label>
                  <input id={`desc-${t.id}`} name="description" defaultValue={t.description ?? ''} className="input text-sm" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`val-${t.id}`}>Valid for (months)</label>
                  <input id={`val-${t.id}`} name="validityMonths" type="number" min={1} defaultValue={t.validity_months ?? ''} placeholder="no default" className="input w-28 text-sm" />
                </div>
                <button type="submit" className="btn-ghost btn-sm">Save</button>
              </form>
              <form action={toggleCertTypeAction} className="self-start">
                <input type="hidden" name="certTypeId" value={t.id} />
                {t.active ? (
                  <button type="submit" className="label text-[11px] text-neg hover:underline">Deactivate (hides from new adds; held certs keep counting)</button>
                ) : (
                  <><input type="hidden" name="active" value="on" /><button type="submit" className="label text-[11px] hover:text-ink">Reactivate</button></>
                )}
              </form>
            </div>
          );
        })}
      </div>

      <form action={createCertTypeAction} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="name">Add a certification</label>
          <input id="name" name="name" required placeholder="e.g. Concussion Awareness" className="input text-sm" />
        </div>
        <div className="min-w-64 flex-1">
          <label className="field-label" htmlFor="description">Description (optional)</label>
          <input id="description" name="description" className="input text-sm" />
        </div>
        <div>
          <label className="field-label" htmlFor="validityMonths">Valid for (months)</label>
          <input id="validityMonths" name="validityMonths" type="number" min={1} placeholder="optional" className="input w-28 text-sm" />
        </div>
        <button type="submit" className="btn-gold btn-sm">Add</button>
        <p className="w-full text-xs text-silver">A validity period auto-fills the expiry when staff record an obtained date; expiry is always required either way.</p>
      </form>
    </main>
  );
}
