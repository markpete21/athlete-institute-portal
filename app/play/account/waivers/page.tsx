import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { householdProgramWaivers } from '@/lib/waivers';
import { signProgramWaiverAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Household waivers (/account/waivers) — the "Sign" CTA on the account page
 * lands here. One signature per family per program, signed by the HoH, valid
 * one year; unsigned waivers show the full text with a typed-name signature.
 */
export default async function WaiversPage() {
  const session = await getPortalSession();
  if (!session.userId) redirect('/sign-in');
  if (!session.familyId) redirect('/account');

  const rows = await householdProgramWaivers(session.familyId);
  const { data: fam } = await supabaseAdmin()
    .from('families').select('hoh_profile_id').eq('id', session.familyId).single();
  const isHoh = fam?.hoh_profile_id === session.profileId;
  const unsigned = rows.filter((r) => !r.satisfied);

  return (
    <main className="pa-wrap">
      <div className="pa-head">
        <div>
          <p className="label text-[11px]"><Link href="/account" className="pa-inline-link">Account</Link> · Waivers</p>
          <h1 className="pa-h1">Waivers<span className="pa-dot">.</span></h1>
        </div>
      </div>

      {rows.length === 0 && <p className="pa-empty">No registrations here need a waiver.</p>}

      {unsigned.length > 0 && !isHoh && (
        <p className="pa-empty" style={{ marginBottom: 18 }}>
          {unsigned.length} waiver{unsigned.length === 1 ? '' : 's'} below still need signing — waivers are
          signed once per household by the Head of Household.
        </p>
      )}

      {rows.map((r) => (
        <section key={r.programId} className="card pa-panel" style={{ marginBottom: 18 }}>
          <div className="pa-sec-head" style={{ marginBottom: 0 }}>
            <h2 className="pa-h2">{r.programName}</h2>
            <span className="tag text-[10px]" style={r.satisfied ? undefined : { color: 'var(--accent)', borderColor: 'var(--accent)' }}>
              {r.satisfied
                ? `Signed ${r.signedAt ? new Date(r.signedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
                : 'Needs signing'}
            </span>
          </div>
          <p className="pa-note">{r.waiver.name} · version {r.waiver.version}</p>

          {!r.satisfied && (
            <>
              <div
                className="mono"
                style={{
                  whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.55, maxHeight: 300,
                  overflowY: 'auto', border: '1px solid var(--ps-hairline)', padding: '12px 14px',
                }}
              >
                {r.waiver.body}
              </div>
              {isHoh ? (
                <form action={signProgramWaiverAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="programId" value={r.programId} />
                  <input type="hidden" name="waiverId" value={r.waiver.id} />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <label className="field-label" htmlFor={`sig-${r.programId}`}>Type your full legal name to sign</label>
                    <input id={`sig-${r.programId}`} name="signature" required minLength={2} className="input" placeholder="Full name" />
                  </div>
                  <button type="submit" className="btn-gold btn-sm">Sign waiver</button>
                </form>
              ) : (
                <p className="pa-note">Ask your Head of Household to sign this one.</p>
              )}
            </>
          )}
        </section>
      ))}
    </main>
  );
}
