'use client';

import { useState, useTransition } from 'react';
import { linkSuperstatMatchAction, superstatSyncAction } from '../../actions';

type Summary = Awaited<ReturnType<typeof superstatSyncAction>>;

/**
 * "Sync now": runs the Superstat sync and shows what it found. Stats it loads
 * stay unpublished. A match it could not tie to a scheduled game gets a
 * picker (Superstat's date is the upload time, so rematches can be unclear).
 */
export function SuperstatSync({ brand, leagueSlug, games }: { brand: string; leagueSlug: string; games: { id: number; label: string }[] }) {
  const [pending, start] = useTransition();
  const [sum, setSum] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<Summary>) => start(async () => { setErr(''); try { setSum(await fn()); } catch (e) { setErr(e instanceof Error ? e.message : 'Sync failed.'); } });
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn-gold btn-sm self-start" disabled={pending} onClick={() => run(() => superstatSyncAction(brand, leagueSlug))}>{pending ? 'Syncing…' : 'Sync now'}</button>
      {err && <p className="text-xs" style={{ color: '#b4483c' }}>{err}</p>}
      {sum && (
        <div className="text-xs">
          <p><b>{sum.statsLoaded}</b> game{sum.statsLoaded === 1 ? '' : 's'} loaded · {sum.gamesLinked} linked · {sum.matchesSeen} match{sum.matchesSeen === 1 ? '' : 'es'} in Superstat · {sum.teamsLinked} teams linked</p>
          {sum.unlinkedMatches.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="label text-[10px]">Which game is this?</p>
              {sum.unlinkedMatches.map((m) => (
                <div key={m.id} className="flex flex-col gap-1 rounded border border-hairline p-2">
                  <span>{m.label} <span className="text-silver">· {m.status.replace('_', ' ')}</span></span>
                  <div className="flex gap-1">
                    <select className="input text-xs" value={pick[m.id] ?? ''} onChange={(e) => setPick({ ...pick, [m.id]: e.target.value })} aria-label={`Scheduled game for ${m.label}`}>
                      <option value="">Choose the scheduled game</option>
                      {games.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </select>
                    <button type="button" className="btn-ghost btn-sm" disabled={pending || !pick[m.id]} onClick={() => run(() => linkSuperstatMatchAction(brand, leagueSlug, Number(pick[m.id]), m.id))}>Link</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {([['Still processing', sum.waiting], ['Notes', sum.skipped], ['Errors', sum.errors]] as [string, string[]][]).filter(([, l]) => l.length).map(([h, l]) => (
            <div key={h} className="mt-1"><p className="label text-[10px]">{h}</p><ul>{l.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ))}
        </div>
      )}
    </div>
  );
}
