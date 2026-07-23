import { supabaseAdmin } from '@ai/foundation/supabase';
import { assignRoleAction, createRoleAction, unassignRoleAction, updateRoleAction } from './actions';

export const dynamic = 'force-dynamic';

interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
}

interface AssignmentRow {
  id: number;
  role_id: number;
  profiles: { email: string | null; first_name: string | null; last_name: string | null } | null;
}

/**
 * Role administration (Module 1 Stage 3): add/edit roles and grant them to
 * accounts by email. Permission matrices per role land with Module 5.
 */
export default async function RolesAdminPage() {
  const db = supabaseAdmin();
  const [{ data: roles }, { data: assignments }] = await Promise.all([
    db.from('roles').select('id, name, description, is_system').order('name'),
    db.from('role_assignments').select('id, role_id, profiles(email, first_name, last_name)').order('id'),
  ]);

  const byRole = new Map<number, AssignmentRow[]>();
  for (const a of (assignments ?? []) as unknown as AssignmentRow[]) {
    byRole.set(a.role_id, [...(byRole.get(a.role_id) ?? []), a]);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Accounts</p>
        <h1 className="text-5xl">
          Roles<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Roles are permission sets. Staff hold one or more; customers can hold a
          role too (a volunteer coach) — it unlocks the admin side for that scope.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {((roles ?? []) as RoleRow[]).map((role) => (
          <div key={role.id} className="card flex flex-col gap-4 p-6">
            <form action={updateRoleAction} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <input type="hidden" name="roleId" value={role.id} />
              <div>
                <label className="field-label" htmlFor={`name-${role.id}`}>Role</label>
                <input id={`name-${role.id}`} name="name" defaultValue={role.name} className="input" />
              </div>
              <div>
                <label className="field-label" htmlFor={`desc-${role.id}`}>Description</label>
                <input id={`desc-${role.id}`} name="description" defaultValue={role.description ?? ''} className="input" />
              </div>
              <div className="flex items-end gap-2">
                <button type="submit" className="btn-ghost btn-sm">Save</button>
                {role.is_system && <span className="tag">system</span>}
              </div>
            </form>

            <div className="flex flex-col gap-2 border-t border-hairline pt-4">
              <p className="label text-[11px]">Held by</p>
              {(byRole.get(role.id) ?? []).length === 0 && <p className="text-sm text-silver">No one yet.</p>}
              {(byRole.get(role.id) ?? []).map((a) => (
                <form key={a.id} action={unassignRoleAction} className="flex items-center gap-3 text-sm">
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <span className="text-ink">
                    {[a.profiles?.first_name, a.profiles?.last_name].filter(Boolean).join(' ') || a.profiles?.email || 'Unknown'}
                  </span>
                  <span className="text-silver">{a.profiles?.email}</span>
                  <button type="submit" className="btn-ghost btn-sm">Revoke</button>
                </form>
              ))}
              <form action={assignRoleAction} className="mt-2 flex items-end gap-3">
                <input type="hidden" name="roleId" value={role.id} />
                <div className="flex-1">
                  <label className="field-label" htmlFor={`assign-${role.id}`}>Grant to (account email)</label>
                  <input id={`assign-${role.id}`} name="email" type="email" className="input" placeholder="person@example.ca" />
                </div>
                <button type="submit" className="btn-gold btn-sm">Grant</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-2xl">Add a role</h2>
        <form action={createRoleAction} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <div>
            <label className="field-label" htmlFor="new-name">Role name</label>
            <input id="new-name" name="name" required className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="new-desc">Description</label>
            <input id="new-desc" name="description" className="input" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-gold btn-sm">Create</button>
          </div>
        </form>
      </section>
    </main>
  );
}
