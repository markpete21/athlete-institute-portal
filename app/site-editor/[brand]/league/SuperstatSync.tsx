'use client';

import { useState, useTransition } from 'react';
import { superstatSyncAction } from '../../actions';

type Summary = Awaited<ReturnType<typeof superstatSyncAction>>;

/** "Sync now": runs the Superstat sync and shows what it found. Stats it loads stay unpublished. */
export function SuperstatSync({ brand, leagueSlug }: { brand: string; leagueSlug: string }) {
  const [pending, start] = useTransition();
  const [sum, setSum] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn-gold btn-sm self-start" disabled={pending} onClick={() => start(async () => { setErr(''); try { setSum(await superstatSyncAction(brand, leagueSlug)); } catch (e) { setErr(e instanceof Error ? e.message : 'Sync failed.'); } })}>{pending ? 'Syncing…' : 'Sync now'}</button>
      {err && <p className="text-xs" style={{ color: '#b4483c' }}>{err}</p>}
      {sum && (
        <div className="text-xs">
          <p><b>{sum.statsLoaded}</b> game{sum.statsLoaded === 1 ? '' : 's'} loaded · {sum.gamesLinked} linked · {sum.matchesSeen} match{sum.matchesSeen === 1 ? '' : 'es'} in Superstat · {sum.teamsLinked} teams linked</p>
          {([['Still processing', sum.waiting], ['Not matched to a game', sum.unlinked], ['Notes', sum.skipped], ['Errors', sum.errors]] as [string, string[]][]).filter(([, l]) => l.length).map(([h, l]) => (
            <div key={h} className="mt-1"><p className="label text-[10px]">{h}</p><ul>{l.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ))}
        </div>
      )}
    </div>
  );
}
