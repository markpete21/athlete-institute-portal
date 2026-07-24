import Link from 'next/link';
import { notFound } from 'next/navigation';
import { renderBlocks, type EmailBlock } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { preSendSpamCheck } from '@/lib/comms/campaigns';
import { campaignStats, linkClicks, recipientDetail } from '@/lib/comms/stats';
import { cancelScheduleAction, scheduleAction, sendAction } from '../actions';

export const dynamic = 'force-dynamic';

/** Admin: one campaign - preview, spam check, schedule/send, and stats. */
export default async function CampaignPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const db = supabaseAdmin();
  const { data: c } = await db.from('comms_campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();

  const html = c.kind === 'announcement' ? `<p>${c.body_text ?? ''}</p>` : renderBlocks((c.blocks ?? []) as EmailBlock[], { first_name: 'Jordan', brand: c.brand_key ?? '' });
  const isSent = c.status === 'sent';
  const [warnings, stats, detail, clicks] = await Promise.all([
    isSent ? Promise.resolve([]) : preSendSpamCheck(id),
    isSent ? campaignStats(id) : Promise.resolve(null),
    isSent ? recipientDetail(id) : Promise.resolve([]),
    isSent ? linkClicks(id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between border-b border-hairline pb-4">
        <div><Link href="/comms" className="label text-[11px]">← Communications</Link><h1 className="text-3xl">{c.name}<span style={{ color: 'var(--accent)' }}>.</span></h1></div>
        <span className="tag">{c.status}</span>
      </header>

      <section className="flex flex-col gap-2">
        <p className="field-label">Subject</p><p className="text-ink">{c.subject}</p>
        <p className="field-label mt-2">Preview (desktop)</p>
        <div className="card overflow-x-auto p-4" dangerouslySetInnerHTML={{ __html: html }} />
        <p className="field-label mt-2">Preview (mobile)</p>
        <div className="card mx-auto w-[360px] max-w-full overflow-x-auto p-4" dangerouslySetInnerHTML={{ __html: html }} />
      </section>

      {!isSent && (
        <>
          {warnings.length > 0 && (
            <section className="card border-l-2 border-[var(--accent)] p-4">
              <p className="field-label">Spam check</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-body">{warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>
            </section>
          )}
          <section className="flex flex-wrap items-end gap-3">
            {c.status === 'scheduled' ? (
              <form action={cancelScheduleAction}><input type="hidden" name="campaignId" value={id} /><button className="btn-ghost btn-sm">Cancel schedule ({new Date(c.scheduled_at).toLocaleString('en-CA', { timeZone: 'America/Toronto' })})</button></form>
            ) : (
              <form action={scheduleAction} className="flex items-end gap-2"><input type="hidden" name="campaignId" value={id} /><div><label className="field-label">Schedule for</label><input name="when" type="datetime-local" required className="input text-sm" /></div><button className="btn-ghost btn-sm">Schedule</button></form>
            )}
            <form action={sendAction}><input type="hidden" name="campaignId" value={id} /><button className="btn-gold btn-sm">Send now</button></form>
          </section>
        </>
      )}

      {isSent && stats && (
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[['Sent', stats.sent], ['Delivered', stats.delivered], ['Opened', `${stats.opened} (${Math.round(stats.openRate * 100)}%)`], ['Clicked', `${stats.clicked} (${Math.round(stats.clickRate * 100)}%)`], ['Bounced', stats.bounced], ['Unsub', stats.unsubscribed]].map(([k, v]) => (
              <div key={k as string} className="card p-3"><p className="label text-[10px]">{k}</p><p className="text-xl">{v}</p></div>
            ))}
          </div>
          {clicks.length > 0 && <div className="card p-4"><p className="field-label">Link clicks</p>{clicks.map((l) => <div key={l.url} className="flex justify-between text-sm"><span className="truncate text-body">{l.url}</span><span>{l.clicks}</span></div>)}</div>}
          <div className="card overflow-x-auto p-4">
            <p className="field-label">Recipients</p>
            <table className="data-table mt-1 min-w-[420px] text-sm"><thead><tr><th>Email</th><th>Status</th><th>Opened</th><th>Clicked</th></tr></thead>
              <tbody>{detail.map((r) => <tr key={r.email}><td>{r.email}</td><td>{r.status}</td><td>{r.opened ? '✓' : ''}</td><td>{r.clicked ? '✓' : ''}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
