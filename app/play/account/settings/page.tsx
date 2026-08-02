import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/auth';
import { getOrCreateProfile } from '@/lib/profile';
import { effectiveTypeSettings } from '@/lib/type-settings';
import { updateMySettingsAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * My settings (/account/settings) — self-serve profile editing. Name and
 * email are owned by the sign-in (Clerk) and change there; phone and
 * communication preferences live here.
 */
export default async function SettingsPage() {
  const session = await getPortalSession();
  if (!session.userId) redirect('/sign-in');
  const profile = await getOrCreateProfile();
  const marketingOptIn =
    profile.user_type === 'customer'
      ? effectiveTypeSettings('customer', profile.settings).marketingOptIn
      : null;

  return (
    <main className="pa-wrap">
      <div className="pa-head">
        <div>
          <p className="label text-[11px]"><Link href="/account" className="pa-inline-link">Account</Link> · Settings</p>
          <h1 className="pa-h1">My settings<span className="pa-dot">.</span></h1>
        </div>
      </div>

      <section className="card pa-panel" style={{ maxWidth: 640 }}>
        <form action={updateMySettingsAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="field-label">Name</p>
              <p className="text-ink">{[profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—'}</p>
            </div>
            <div>
              <p className="field-label">Email</p>
              <p className="mono text-sm">{profile.email ?? '—'}</p>
            </div>
          </div>
          <p className="pa-note">
            Name and email come from your sign-in. To change them, use the account
            menu&apos;s profile settings — updates flow through automatically.
          </p>
          <div style={{ maxWidth: 280 }}>
            <label className="field-label" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ''} className="input" placeholder="(519) 555-0123" />
          </div>
          {marketingOptIn !== null && (
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" name="marketingOptIn" defaultChecked={marketingOptIn} style={{ marginTop: 3 }} />
              <span className="text-sm">
                Send me news and offers from Athlete Institute
                <span className="pa-note" style={{ display: 'block' }}>
                  Optional. Registration and payment emails always arrive regardless.
                </span>
              </span>
            </label>
          )}
          <div>
            <button type="submit" className="btn-gold btn-sm">Save settings</button>
          </div>
        </form>
      </section>

      <p className="pa-note" style={{ marginTop: 18 }}>
        Household members are managed on the <Link href="/account/members" className="pa-inline-link">household page</Link>.
      </p>
    </main>
  );
}
