import Link from 'next/link';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createCampaignAction, draftCampaignAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string | undefined> = { draft: '#9EA1A1', scheduled: '#9E8959', sending: '#9E8959', sent: '#3f7a5b', canceled: '#b4483c' };

/** Admin: Communications hub (Module 13) - campaigns list + quick create + Claude-draft. */
export default async function CommsPage() {
  const { data: campaigns } = await supabaseAdmin().from('comms_campaigns').select('id, name, kind, status, subject, scheduled_at, sent_at').order('id', { ascending: false }).limit(50);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between border-b border-hairline pb-4">
        <div><p className="label text-[11px]">Communications</p><h1 className="text-3xl">Campaigns<span style={{ color: 'var(--accent)' }}>.</span></h1></div>
        <nav className="flex gap-2">
          <Link href="/comms/announce" className="btn-ghost btn-sm">Announcement</Link>
          <Link href="/comms/notifications" className="btn-ghost btn-sm">Auto-notifications</Link>
        </nav>
      </header>

      <section className="flex flex-col gap-2">
        {(campaigns ?? []).length === 0 && <p className="text-body">No campaigns yet.</p>}
        {(campaigns ?? []).map((c) => (
          <Link key={c.id} href={`/comms/${c.id}`} className="card flex items-center justify-between p-3 hover:border-[var(--accent)]">
            <span className="flex flex-col"><span className="font-bold text-ink">{c.name}</span><span className="text-xs text-silver">{c.subject}</span></span>
            <span className="flex items-center gap-3 text-xs">
              {c.kind === 'announcement' && <span className="tag">blast</span>}
              <span className="tag" style={{ color: STATUS_COLOR[c.status], borderColor: STATUS_COLOR[c.status] }}>{c.status}</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <form action={createCampaignAction} className="card flex flex-col gap-2 p-4">
          <h2 className="text-lg">New campaign</h2>
          <input name="name" required placeholder="Campaign name" className="input text-sm" />
          <input name="subject" required placeholder="Subject line" className="input text-sm" />
          <textarea name="body" required placeholder="Email body (merge tags like {{first_name}})" className="input min-h-24 text-sm" />
          <input name="programIds" placeholder="Audience: program IDs (comma-sep)" className="input text-sm" />
          <input name="brandKey" placeholder="Brand key (optional)" className="input text-sm" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isMarketing" defaultChecked /> Marketing (adds unsubscribe/footer)</label>
          <button className="btn-gold btn-sm">Create draft</button>
        </form>

        <form action={draftCampaignAction} className="card flex flex-col gap-2 p-4">
          <h2 className="text-lg">Draft with Claude</h2>
          <p className="text-xs text-silver">Describe the email; Claude generates on-brand editable blocks (claude-sonnet-4-6).</p>
          <textarea name="prompt" required placeholder="e.g. Announce spring registration is open for U10-U14 with an early-bird deadline" className="input min-h-24 text-sm" />
          <input name="brandKey" placeholder="Brand key (optional)" className="input text-sm" />
          <button className="btn-ghost btn-sm">Generate draft</button>
        </form>
      </section>
    </main>
  );
}
