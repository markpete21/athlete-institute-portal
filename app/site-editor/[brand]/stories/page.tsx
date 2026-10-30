import Link from 'next/link';
import { listPostsAdmin } from '@/lib/site/posts';
import { unpublishPostAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';

export const dynamic = 'force-dynamic';

const ST: Record<string, { label: string; cls: string }> = { published: { label: 'Published', cls: 'pos' }, scheduled: { label: 'Scheduled', cls: 'warn' }, draft: { label: 'Draft', cls: 'muted' } };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

/** Stories list (ALL CAN §6.7): drafts, scheduled and published; New story opens the editor. */
export default async function StoriesAdmin({ params, searchParams }: { params: { brand: string }; searchParams: { status?: string } }) {
  const brand = params.brand;
  const posts = (await listPostsAdmin(brand)).filter((p) => !searchParams.status || p.status === searchParams.status);
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="card-head"><h2>Stories</h2><span className="card-head-lbl">{posts.length}</span></div>
        <div className="flex items-center gap-2">
          <nav className="seg">{[['', 'All'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['published', 'Published']].map(([k, l]) => <Link key={k} href={`/admin/stories${k ? `?status=${k}` : ''}`} className={(searchParams.status ?? '') === k ? 'on' : ''}>{l}</Link>)}</nav>
          <Link href={`/admin/stories/new`} className="btn-gold btn-sm no-underline">New story</Link>
        </div>
      </div>
      {posts.length === 0 ? <p className="text-body text-sm">No stories yet. Announcements and features live here; the newest three show on the home page.</p> : (
        <table className="data-table">
          <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>{posts.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/admin/stories/${p.id}`} className="font-bold no-underline text-ink">{p.title}</Link><br /><span className="mono text-xs text-silver">/stories/{p.slug}</span></td>
              <td>{p.type}{p.locationSlug ? <span className="text-silver"> · {p.locationSlug}</span> : ''}</td>
              <td><span className={`pill-status ${ST[p.status].cls}`}>{ST[p.status].label}</span></td>
              <td className="text-xs text-silver">{fmt(p.publishedAt)}</td>
              <td className="text-right">{p.status !== 'draft' && <form action={unpublishPostAction}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Done">Unpublish</SubmitButton></form>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
