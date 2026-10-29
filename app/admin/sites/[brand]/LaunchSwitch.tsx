'use client';

import { useState, useTransition } from 'react';
import { setStatusAction } from '../actions';

const LABELS: Record<string, string> = { off: 'Off', coming_soon: 'Coming soon', live: 'Live' };

/** Off → Coming soon → Live with a confirm step; Live needs the launch checks green. */
export function LaunchSwitch({ brand, status, ready }: { brand: string; status: string; ready: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (next: string) => {
    if (next === 'live' && !confirm('Go live? The site becomes public at its domain right away.')) return;
    if (next === 'off' && !confirm('Switch the site off? Visitors will see a 404 until it is switched on again.')) return;
    const fd = new FormData(); fd.set('brand', brand); fd.set('status', next);
    start(async () => { const r = await setStatusAction(fd); setMsg(r.ok ? null : r.blockers.join(' ')); });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="seg">
        {Object.entries(LABELS).map(([k, l]) => <button key={k} type="button" className={status === k ? 'on' : ''} disabled={pending || (k === 'live' && !ready && status !== 'live')} onClick={() => k !== status && set(k)} title={k === 'live' && !ready ? 'Finish the launch checks first' : undefined}>{l}</button>)}
      </div>
      {pending && <span className="text-xs text-silver">Saving…</span>}
      {msg && <span className="text-xs" style={{ color: '#b4483c' }}>{msg}</span>}
    </div>
  );
}
