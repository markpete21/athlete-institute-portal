import { redirect } from 'next/navigation';
import { getSiteSession } from '@/lib/site/editor-session';
import { accessLog, canManage, listMembers, siteRoleFor, superAdmins } from '@/lib/site/scopes';
import { changeRoleAction, inviteMemberAction, removeMemberAction, resendInviteAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';

export const dynamic = 'force-dynamic';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never');

/** Members (ALL CAN §6.9): who can work on this site and at what level; invite by email; access log. */
export default async function MembersPage({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  const role = await siteRoleFor(await getSiteSession(brand), brand);
  if (!role || !canManage(role)) redirect('/admin');
  const [members, supers, log] = await Promise.all([listMembers(brand), superAdmins(), accessLog(brand, 10)]);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card flex flex-col gap-4 p-5 lg:col-span-2">
        <div className="card-head"><h2>Members</h2><span className="card-head-lbl">{members.length} on this site · {supers.length} super admin{supers.length === 1 ? '' : 's'}</span></div>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last active</th><th></th></tr></thead>
          <tbody>
            {supers.map((s) => <tr key={s.email}><td>{s.name}<br /><span className="text-xs text-silver">{s.email}</span></td><td>Super admin</td><td><span className="pill-status muted">All apps</span></td><td className="text-silver">—</td><td></td></tr>)}
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}<br /><span className="text-xs text-silver">{m.email}</span></td>
                <td><form action={changeRoleAction} className="flex items-center gap-1"><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={m.id} />
                  <select name="role" defaultValue={m.role} className="input text-xs"><option value="admin">Admin</option><option value="editor">Editor</option><option value="writer">Writer</option></select><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Saved">Change</SubmitButton></form></td>
                <td><span className={`pill-status ${m.status === 'active' ? 'pos' : 'warn'}`}>{m.status === 'active' ? 'Active' : 'Invited'}</span></td>
                <td className="text-silver">{fmt(m.lastActiveAt)}</td>
                <td className="text-right"><div className="flex justify-end gap-1">
                  {m.status === 'invited' && <form action={resendInviteAction}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={m.id} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="Sending…" doneLabel="Sent">Resend</SubmitButton></form>}
                  <form action={removeMemberAction}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={m.id} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="Removing…" doneLabel="Removed">Remove</SubmitButton></form>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rounded border border-hairline p-3 text-xs text-body">
          <b>Admin</b> everything on this site, including members, domains and the launch switch · <b>Editor</b> pages, menu, stories, media and SEO; can publish · <b>Writer</b> drafts stories and uploads media; an editor publishes.
        </div>
      </section>
      <div className="flex flex-col gap-5">
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Add a member</h2></div>
          <form action={inviteMemberAction} className="flex flex-col gap-3">
            <input type="hidden" name="brand" value={brand} />
            <div className="flex flex-col"><label className="field-label" htmlFor="inv-email">Email</label><input id="inv-email" name="email" type="email" required className="input text-sm" /></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="inv-role">Role</label><select id="inv-role" name="role" defaultValue="editor" className="input text-sm"><option value="admin">Admin</option><option value="editor">Editor</option><option value="writer">Writer</option></select></div>
            <SubmitButton className="btn-gold btn-sm" pendingLabel="Inviting…" doneLabel="Invited">Send invite</SubmitButton>
            <p className="text-xs text-silver">They sign in with their Athlete Institute account; the invite attaches on first sign-in.</p>
          </form>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <div className="card-head"><h2>Access log</h2></div>
          {log.length === 0 ? <p className="text-body text-sm">No changes yet.</p> : <ul className="flex flex-col gap-1 text-xs">{log.map((l, i) => <li key={i}><span className="text-silver">{fmt(l.at)}</span> · {l.actor} · {l.action.replace('site.', '')}{l.meta.email ? ` · ${String(l.meta.email)}` : ''}{l.meta.role ? ` · ${String(l.meta.role)}` : ''}</li>)}</ul>}
        </section>
      </div>
    </div>
  );
}
