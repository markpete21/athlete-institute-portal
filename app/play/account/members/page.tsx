import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canManageFamily } from '@ai/foundation';
import { BUCKETS, getSignedUrl } from '@ai/foundation/storage';
import { getPortalSession } from '@/lib/auth';
import { getOrCreateFamily, memberRowFor, type FamilyMember } from '@/lib/family';
import { MEMBER_COLOURS } from '@/lib/play/account';
import { getOrCreateProfile } from '@/lib/profile';
import {
  addMemberAction,
  removeMemberAction,
  removeMemberPhotoAction,
  shareMemberAction,
  unshareMemberAction,
  updateMemberAction,
  uploadMemberPhotoAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  hoh: 'Head of Household',
  secondary: 'Secondary parent',
  dependent: 'Dependent',
  adult: 'Adult member',
};

/**
 * Household manager (/account/members) — roster, member editing, photos and
 * dual-household sharing, in the Play App design. HoH manages; secondary
 * parents see-but-not-edit; a shared-in child (dual-household) is managed by
 * their primary household and can only be unlinked here.
 */
export default async function MembersPage() {
  const session = await getPortalSession();
  if (!session.userId) redirect('/sign-in');

  const profile = await getOrCreateProfile();
  const family = await getOrCreateFamily(profile);
  const me = memberRowFor(family, profile.id);
  const manages = !!me && canManageFamily(me.member_role);

  const photoUrls = new Map<number, string>();
  for (const m of family.members) {
    if (m.photo_path) {
      try { photoUrls.set(m.id, await getSignedUrl(BUCKETS.memberPhotos, m.photo_path, 3600)); } catch { /* initials fallback */ }
    }
  }

  const ownsMember = (m: FamilyMember) => m.family_id === family.id;

  return (
    <main className="pa-wrap">
      <div className="pa-head">
        <div>
          <p className="label text-[11px]"><Link href="/account" className="pa-inline-link">Account</Link> · Household</p>
          <h1 className="pa-h1">{family.name}<span className="pa-dot">.</span></h1>
        </div>
        <div className="pa-head-actions">
          <Link href="/account/settings" className="btn-ghost btn-sm">My settings</Link>
        </div>
      </div>

      {me && !manages && (
        <p className="pa-empty" style={{ marginBottom: 18 }}>
          {me.member_role === 'secondary'
            ? 'You can register and pay for this household — members are managed by the Head of Household.'
            : 'Members are managed by the Head of Household.'}
        </p>
      )}

      {family.members.map((m, i) => {
        const colour = MEMBER_COLOURS[i % MEMBER_COLOURS.length];
        const photo = photoUrls.get(m.id);
        const sharedIn = !ownsMember(m);
        const sharedOut = ownsMember(m) && m.second_family_id != null;
        return (
          <section key={m.id} className="card pa-panel" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="pa-av" style={{ width: 44, height: 44, borderColor: colour }} />
              ) : (
                <span className="pa-av pa-av-ini" style={{ width: 44, height: 44, background: colour, fontSize: 15 }}>
                  {(m.first_name?.[0] ?? '?').toUpperCase()}
                </span>
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <p className="text-ink" style={{ fontWeight: 600 }}>{m.first_name} {m.last_name}</p>
                <p className="pa-note">
                  {[m.dob, m.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <span className="tag text-[10px]">{ROLE_LABEL[m.member_role]}</span>
              {(sharedIn || sharedOut) && (
                <span className="tag text-[10px]" title="This child is on two household rosters">
                  {sharedIn ? 'Shared from another household' : 'Shared household'}
                </span>
              )}
            </div>

            {manages && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                {ownsMember(m) ? (
                  <>
                    <details>
                      <summary className="label text-[10px]" style={{ cursor: 'pointer' }}>Edit details</summary>
                      <form action={updateMemberAction} className="grid gap-3 sm:grid-cols-2" style={{ paddingTop: 10, maxWidth: 560 }}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <div>
                          <label className="field-label" htmlFor={`fn-${m.id}`}>First name</label>
                          <input id={`fn-${m.id}`} name="firstName" defaultValue={m.first_name} required className="input h-9 text-sm" />
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`ln-${m.id}`}>Last name</label>
                          <input id={`ln-${m.id}`} name="lastName" defaultValue={m.last_name} required className="input h-9 text-sm" />
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`dob-${m.id}`}>Date of birth</label>
                          <input id={`dob-${m.id}`} name="dob" type="date" defaultValue={m.dob ?? ''} className="input h-9 text-sm" />
                        </div>
                        <div>
                          <label className="field-label" htmlFor={`em-${m.id}`}>Email</label>
                          <input id={`em-${m.id}`} name="email" type="email" defaultValue={m.email ?? ''} className="input h-9 text-sm" />
                        </div>
                        <div className="flex items-end">
                          <button type="submit" className="btn-gold btn-sm">Save</button>
                        </div>
                      </form>
                    </details>

                    <details>
                      <summary className="label text-[10px]" style={{ cursor: 'pointer' }}>{photo ? 'Change photo' : 'Add photo'}</summary>
                      <div style={{ paddingTop: 10, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
                        <form action={uploadMemberPhotoAction} className="flex items-end gap-2">
                          <input type="hidden" name="memberId" value={m.id} />
                          <div>
                            <label className="field-label" htmlFor={`ph-${m.id}`}>JPEG / PNG / WebP, under 5 MB</label>
                            <input id={`ph-${m.id}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="input h-9 text-sm" />
                          </div>
                          <button type="submit" className="btn-gold btn-sm">Upload</button>
                        </form>
                        {photo && (
                          <form action={removeMemberPhotoAction}>
                            <input type="hidden" name="memberId" value={m.id} />
                            <button type="submit" className="btn-ghost btn-sm">Remove photo</button>
                          </form>
                        )}
                      </div>
                    </details>

                    {m.member_role === 'dependent' && !sharedOut && (
                      <details>
                        <summary className="label text-[10px]" style={{ cursor: 'pointer' }}>Share with another household</summary>
                        <div style={{ paddingTop: 10, maxWidth: 560 }}>
                          <p className="pa-note" style={{ marginBottom: 8 }}>
                            For families across two homes: {m.first_name} will appear on both households&apos;
                            rosters and schedules, and either household can register and pay — each
                            household&apos;s payments stay on its own account.
                          </p>
                          <form action={shareMemberAction} className="flex items-end gap-2 flex-wrap">
                            <input type="hidden" name="memberId" value={m.id} />
                            <div style={{ flex: 1, minWidth: 220 }}>
                              <label className="field-label" htmlFor={`sh-${m.id}`}>Other parent&apos;s account email</label>
                              <input id={`sh-${m.id}`} name="targetEmail" type="email" required className="input h-9 text-sm" placeholder="them@example.com" />
                            </div>
                            <button type="submit" className="btn-gold btn-sm">Share</button>
                          </form>
                        </div>
                      </details>
                    )}
                    {sharedOut && (
                      <form action={unshareMemberAction}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <button type="submit" className="btn-ghost btn-sm">Stop sharing</button>
                      </form>
                    )}
                    {m.member_role !== 'hoh' && (
                      <form action={removeMemberAction} style={{ marginLeft: 'auto' }}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <button type="submit" className="btn-ghost btn-sm">
                          {sharedOut ? 'Remove (other household keeps them)' : 'Remove'}
                        </button>
                      </form>
                    )}
                  </>
                ) : (
                  <>
                    <p className="pa-note" style={{ alignSelf: 'center' }}>
                      Details are managed by {m.first_name}&apos;s primary household.
                    </p>
                    <form action={removeMemberAction} style={{ marginLeft: 'auto' }}>
                      <input type="hidden" name="memberId" value={m.id} />
                      <button type="submit" className="btn-ghost btn-sm">Remove from my household</button>
                    </form>
                  </>
                )}
              </div>
            )}
          </section>
        );
      })}

      {manages && (
        <section className="card pa-panel" style={{ marginTop: 20 }}>
          <h2 className="pa-h2">Add a family member</h2>
          <form action={addMemberAction} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="firstName">First name</label>
              <input id="firstName" name="firstName" required className="input" />
            </div>
            <div>
              <label className="field-label" htmlFor="lastName">Last name</label>
              <input id="lastName" name="lastName" required className="input" />
            </div>
            <div>
              <label className="field-label" htmlFor="dob">Date of birth</label>
              <input id="dob" name="dob" type="date" className="input" />
            </div>
            <div>
              <label className="field-label" htmlFor="email">Email (optional — notifies them)</label>
              <input id="email" name="email" type="email" className="input" />
            </div>
            <div>
              <label className="field-label" htmlFor="memberRole">Access</label>
              <select id="memberRole" name="memberRole" className="input" defaultValue="dependent">
                <option value="dependent">Dependent (under 18 — view only)</option>
                <option value="adult">Adult member (18+ — self-serve)</option>
                <option value="secondary">Secondary parent (register + pay)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-gold">Add member</button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
