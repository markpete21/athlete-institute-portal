'use client';

import { useRef, useState } from 'react';

interface Msg { role: 'user' | 'assistant'; content: string }

/** Assist chat (Module 21), mobile-first. Surface is resolved server-side. */
export default function AssistChat({ surface }: { surface: 'public' | 'customer' | 'admin' }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ surface, messages: next.slice(-10) }),
      });
      const json = await res.json();
      setMessages((m) => [...m, { role: 'assistant', content: json.reply ?? 'Something went wrong - try again?' }]);
      if (json.navigate) window.location.href = json.navigate;
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Assist is offline right now - text or call us at 519-941-0492.' }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-body text-sm">Hi, I&apos;m Assist! 👋 Ask me anything about our programs — prices, ages, dates, what fits your athlete. Play. Compete. Grow.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`card max-w-[85%] p-3 text-sm ${m.role === 'user' ? 'self-end border-[var(--accent)]' : 'self-start'}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="card max-w-[85%] self-start p-3 text-sm text-silver">Assist is thinking…</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask me anything about our programs…" className="input grow" />
        <button disabled={busy} className="btn-gold btn-sm">Ask</button>
      </form>
    </div>
  );
}
