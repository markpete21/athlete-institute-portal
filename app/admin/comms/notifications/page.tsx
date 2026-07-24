import Link from 'next/link';
import { listTriggers } from '@/lib/comms/notifications';
import { updateTriggerAction } from '../actions';

export const dynamic = 'force-dynamic';

/** Admin: Auto-notification settings (Module 13 Stage 6) - editable triggers. */
export default async function NotificationsPage() {
  const triggers = await listTriggers();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <Link href="/comms" className="label text-[11px]">← Communications</Link>
        <h1 className="text-3xl">Auto-notifications<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body text-sm">Transactional triggers fired across the platform. Each has a default, merge tags, channels, and an on/off toggle.</p>
      </header>

      <div className="flex flex-col gap-3">
        {triggers.map((t) => (
          <form key={t.trigger_key} action={updateTriggerAction} className="card flex flex-col gap-2 p-4">
            <input type="hidden" name="triggerKey" value={t.trigger_key} />
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink">{t.label}</span>
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="enabled" defaultChecked={t.enabled} /> Enabled</label>
            </div>
            <input name="subject" defaultValue={t.subject ?? ''} placeholder="Subject" className="input text-sm" />
            <textarea name="body" defaultValue={t.body_template ?? ''} className="input min-h-16 text-sm" />
            <div className="flex items-center gap-4 text-sm">
              {(['email', 'sms', 'push'] as const).map((ch) => (
                <label key={ch} className="flex items-center gap-1 capitalize"><input type="checkbox" name={`ch_${ch}`} defaultChecked={t.channels.includes(ch)} /> {ch}</label>
              ))}
              <button className="btn-ghost btn-sm ml-auto">Save</button>
            </div>
          </form>
        ))}
      </div>
    </main>
  );
}
