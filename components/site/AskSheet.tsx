'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Ask <brand> (ALL CAN §7.3): a sheet with suggested questions as chips and a
 * free-text box. Answers come from /api/site/ask, which only reads published
 * pages and records, cites sources, and hands off when unsure. No personal
 * data is collected here.
 */
interface QA { q: string; a?: string; sources?: { label: string; href: string }[]; handedOff?: boolean }

export default function AskSheet({ open, onClose, brandKey, askName, prompts }: { open: boolean; onClose: () => void; brandKey: string; askName: string; prompts: string[] }) {
  const [log, setLog] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setValue('');
    setBusy(true);
    setLog((l) => [...l, { q: question }]);
    try {
      const res = await fetch('/api/site/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brandKey, question }) });
      const json = (await res.json()) as { answer: string; sources: { label: string; href: string }[]; handedOff: boolean };
      setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, a: json.answer, sources: json.sources, handedOff: json.handedOff } : x)));
    } catch {
      setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, a: 'Something went wrong. Please try again, or contact us.', handedOff: true } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={`sheet${open ? ' show' : ''}`} aria-label={`Ask ${askName}`} aria-hidden={!open}>
      <div className="sheet-head">
        <div><b>Ask {askName}.</b><div className="note">Answers come from published program facts and policies only.</div></div>
        <button className="x" type="button" onClick={onClose}>Close<i aria-hidden="true" /></button>
      </div>
      <div className="sheet-body" aria-live="polite" ref={logRef} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onClose(); }}>
        {log.length === 0 && (
          <div className="qa-a"><p>Ask about locations, programs, registration or policies. I only answer from what&apos;s published on this site, and I&apos;ll point you to a person when I&apos;m not sure.</p></div>
        )}
        {log.map((x, i) => (
          <div key={i}>
            <div className="qa-q">{x.q}</div>
            <div className="qa-a">
              {x.a == null ? <span className="note">Thinking…</span> : (
                <>
                  <p>{x.a}</p>
                  {x.sources && x.sources.length > 0 && <span className="src">Source: {x.sources.map((s, j) => <span key={j}>{j > 0 ? ', ' : ''}<a href={s.href}>{s.label}</a></span>)}</span>}
                  {x.handedOff && <a href="/about#contact" className="ed-link">Ask a staff member<span className="chev" aria-hidden="true" /></a>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="sheet-foot">
        {log.length === 0 && <div className="chips">{prompts.map((q) => <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}</div>}
        <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void send(value); }}>
          <label className="sr" htmlFor="ask-input">Your question</label>
          <input id="ask-input" ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ask about locations, ages, registration…" autoComplete="off" maxLength={500} />
          <button className="pill pill--ink" type="submit" disabled={busy}>Ask</button>
        </form>
      </div>
    </aside>
  );
}
