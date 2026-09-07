import { supabaseAdmin } from '@ai/foundation/supabase';
import { CAPABILITIES, MANAGE_ROLES } from '@/lib/access/capabilities';
import { hasStaffCapability } from '@/lib/auth';
import { addCapabilityAction, setCapabilityAction } from '../actions';

export const dynamic = 'force-dynamic';

/** The built-in capabilities (the keys the code gates on); custom ones added below join this list. */
const CORE_CAPABILITIES: Array<{ key: string; label: string }> = [...CAPABILITIES];

/** Role × capability matrix (Module 5 Stage 4) — view/edit checkboxes, not hard-coded. */
export default async function PermissionMatrixPage() {
  const db = supabaseAdmin();
  const [{ data: roles }, { data: caps }, canManage] = await Promise.all([
    db.from('roles').select('id, name').order('name'),
    db.from('role_capabilities').select('role_id, capability, can_view, can_edit'),
    hasStaffCapability(MANAGE_ROLES, 'edit'),
  ]);
  const byKey = new Map<string, { view: boolean; edit: boolean }>();
  for (const c of caps ?? []) byKey.set(`${c.role_id}:${c.capability}`, { view: c.can_view, edit: c.can_edit });

  // Extensible: any capability key seeded on any role joins the matrix for every role.
  const capabilities = [...CORE_CAPABILITIES];
  const known = new Set(CORE_CAPABILITIES.map((c) => c.key));
  for (const c of caps ?? []) {
    if (!known.has(c.capability)) {
      known.add(c.capability);
      capabilities.push({ key: c.capability, label: c.capability.replace(/_/g, ' ') });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Staff</p>
        <h1 className="text-5xl">Permissions<span className="text-accent">.</span></h1>
        <p className="text-body">Roles × capabilities. Sensitive roster fields default OFF — grant only where explicitly needed (PIPEDA).</p>
        {!canManage && (
          <p className="pill-status neg self-start">Read-only — changing permissions needs the manage-roles capability.</p>
        )}
      </header>

      {(roles ?? []).map((role) => (
        <div key={role.id} className="card flex flex-col gap-2 p-5">
          <h2 className="text-2xl">{role.name}</h2>
          <div className="flex flex-col gap-1">
            {capabilities.map((cap) => {
              const cur = byKey.get(`${role.id}:${cap.key}`) ?? { view: false, edit: false };
              // The security root is fixed by migration — shown, never edited here.
              const locked = cap.key === MANAGE_ROLES || !canManage;
              return (
                <form key={cap.key} action={setCapabilityAction} className="flex items-center gap-3 border-b border-hairline py-1 text-sm">
                  <input type="hidden" name="roleId" value={role.id} />
                  <input type="hidden" name="capability" value={cap.key} />
                  <span className="flex-1 text-body">{cap.label}</span>
                  <label className="flex items-center gap-1 font-mono text-[11px] uppercase text-silver"><input type="checkbox" name="view" defaultChecked={cur.view} disabled={locked} /> view</label>
                  <label className="flex items-center gap-1 font-mono text-[11px] uppercase text-silver"><input type="checkbox" name="edit" defaultChecked={cur.edit} disabled={locked} /> edit</label>
                  {locked ? <span className="w-14 text-right font-mono text-[10px] uppercase text-silver">{cap.key === MANAGE_ROLES ? 'fixed' : ''}</span> : <button type="submit" className="btn-ghost btn-sm">Save</button>}
                </form>
              );
            })}
          </div>
        </div>
      ))}

      {canManage && <form action={addCapabilityAction} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-56 flex-1">
          <label className="field-label" htmlFor="key">Add a capability</label>
          <input id="key" name="key" required placeholder="e.g. attendance_marking" className="input text-sm" />
        </div>
        <div>
          <label className="field-label" htmlFor="roleId">First granted to</label>
          <select id="roleId" name="roleId" className="input text-sm">
            {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-ghost btn-sm">Add</button>
        <p className="w-full text-xs text-silver">New capabilities appear on every role with view/edit unchecked. Gate features on them via <span className="mono">requireStaffCapability()</span>.</p>
      </form>}
    </main>
  );
}
