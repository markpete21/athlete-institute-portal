'use client';

import { useMemo, useState } from 'react';
import type { PlayerAverages } from '@/lib/compete/compete';

type SortKey = 'ppg' | 'rpg' | 'apg' | 'gp';
const COLS: { key: SortKey; label: string }[] = [
  { key: 'gp', label: 'GP' },
  { key: 'ppg', label: 'PPG' },
  { key: 'rpg', label: 'RPG' },
  { key: 'apg', label: 'APG' },
];

/** Sortable player-averages table. Names are already masked by lib/compete;
 *  each links to the player's public profile. */
export default function AveragesTable({ rows, divisionId }: { rows: PlayerAverages[]; divisionId: number }) {
  const [sort, setSort] = useState<SortKey>('ppg');
  const sorted = useMemo(() => [...rows].sort((a, b) => b[sort] - a[sort]), [rows, sort]);
  return (
    <div className="cs-tablewrap">
      <table className="cs-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Team</th>
            {COLS.map((c) => (
              <th key={c.key} className={sort === c.key ? 'cs-sort on' : 'cs-sort'}>
                <button type="button" onClick={() => setSort(c.key)}>{c.label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.memberId}>
              <td className="cs-team">
                <a className="cs-plink" href={`/${divisionId}/player/${p.memberId}`}>{p.name}</a>
              </td>
              <td>{p.teamName}</td>
              <td className="mono">{p.gp}</td>
              <td className="mono">{p.ppg.toFixed(1)}</td>
              <td className="mono">{p.rpg.toFixed(1)}</td>
              <td className="mono">{p.apg.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
