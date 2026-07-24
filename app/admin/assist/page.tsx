import { supabaseAdmin } from '@ai/foundation/supabase';
import AssistChat from '@/app/play/assist/chat';

export const dynamic = 'force-dynamic';

/** Admin copilot (Module 21): permissioned org reads + navigate-to-spot. */
export default async function AdminAssistPage() {
  const { data: recent } = await supabaseAdmin().from('assist_logs').select('surface, question, handed_off, tool_calls, created_at').order('id', { ascending: false }).limit(10);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Assist · admin copilot</p>
        <h1 className="text-3xl">Copilot<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body text-sm">Try: &quot;who hasn&apos;t paid?&quot;, &quot;take me to conflicts&quot;, &quot;how is program 12 filling?&quot;</p>
      </header>
      <AssistChat surface="admin" />
      <section className="flex flex-col gap-1">
        <p className="field-label">Recent Assist activity (all surfaces)</p>
        {(recent ?? []).map((l, i) => (
          <p key={i} className="text-xs text-body"><span className="tag mr-1">{l.surface}</span>{l.question?.slice(0, 80)}{l.handed_off ? ' · handed off' : ''} · {l.tool_calls} tools</p>
        ))}
      </section>
    </main>
  );
}
