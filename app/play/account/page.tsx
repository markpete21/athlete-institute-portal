import { redirect } from 'next/navigation';
import { canManageFamily, canTransactForFamily } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import { getOrCreateFamily, memberRowFor } from '@/lib/family';
import { getOrCreateProfile } from '@/lib/profile';
import { addMemberAction, removeMemberAction } from './actions';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  hoh: 'Head of Household',
  secondary: 'Secondary parent',
  dependent: 'Dependent',
  adult: 'Adult member',
};

/**
 * Family management (Module 1 Stage 3): the household roster. HoH manages
 * members; secondary parents see-but-not-edit (transact-not-alter); dependents
 * are listed with their access level visible.
 */
export default async function AccountPage() {
  const session = await getPortalSession();
  if (!session.userId) redirect('/sign-in');

  const profile = await getOrCreateProfile();
  const family = await getOrCreateFamily(profile);
  const me = memberRowFor(family, profile.id);
  const manages = !!me && canManageFamily(me.member_role);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Your account</p>
        <h1 className="text-5xl">
          {family.name}
          <span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          You are the <strong>{me ? ROLE_LABEL[me.member_role] : 'member'}</strong>.
          {me && canTransactForFamily(me.member_role) && ' You can register and pay for this household.'}
          {me && !canManageFamily(me.member_role) && me.member_role === 'secondary' &&
            ' Account settings and members are managed by the Head of Household.'}
        </p>
        <p className="label text-[11px]">
          Play Points: <span className="mono text-ink">{family.play_points_balance.toLocaleString()}</span>
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl">Members</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Access</th>
              <th>Date of birth</th>
              <th>Email</th>
              {manages && <th />}
            </tr>
          </thead>
          <tbody>
            {family.members.map((m) => (
              <tr key={m.id}>
                <td className="text-ink">{m.first_name} {m.last_name}</td>
                <td><span className="tag">{ROLE_LABEL[m.member_role]}</span></td>
                <td className="mono">{m.dob ?? '—'}</td>
                <td>{m.email ?? '—'}</td>
                {manages && (
                  <td className="text-right">
                    {m.member_role !== 'hoh' && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <button type="submit" className="btn-ghost btn-sm">Remove</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {manages && (
        <section className="card flex flex-col gap-4 p-6">
          <h2 className="text-2xl">Add a family member</h2>
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
