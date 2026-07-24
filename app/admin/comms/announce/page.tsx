import Link from 'next/link';
import { announceAction } from '../actions';

export const dynamic = 'force-dynamic';

/** Admin: Announcement tool (Module 13 Stage 7) - quick multi-channel blast. */
export default function AnnouncePage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <Link href="/comms" className="label text-[11px]">← Communications</Link>
        <h1 className="text-3xl">Announcement<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body text-sm">A quick blast — type your message, pick channels, send or schedule.</p>
      </header>

      <form action={announceAction} className="flex flex-col gap-4">
        <textarea name="message" required placeholder="Your announcement…" className="input min-h-32" />
        <input name="programIds" placeholder="Audience: program IDs (comma-sep, blank = none)" className="input text-sm" />
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" name="ch_push" defaultChecked /> Push</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="ch_sms" defaultChecked /> SMS</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="ch_email" defaultChecked /> Email</label>
        </div>
        <div><label className="field-label">Schedule (optional — blank sends now)</label><input name="when" type="datetime-local" className="input text-sm" /></div>
        <button className="btn-gold">Send announcement</button>
      </form>
    </main>
  );
}
