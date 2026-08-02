import type { CompeteGame } from '@/lib/compete/compete';

/**
 * Playoff bracket, rendered from playoff games grouped by round. Round labels
 * come from how many teams remain (8 -> Quarterfinals, 4 -> Semifinals,
 * 2 -> Final); anything larger is "Round N". TBD slots are later-round games
 * whose feeder games haven't gone final yet.
 */
function roundLabel(gamesInRound: number): string {
  if (gamesInRound === 1) return 'Final';
  if (gamesInRound === 2) return 'Semifinals';
  if (gamesInRound === 4) return 'Quarterfinals';
  return `Round of ${gamesInRound * 2}`;
}

const TZ = 'America/Toronto';
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';

export default function Bracket({ games }: { games: CompeteGame[] }) {
  const rounds = new Map<number, CompeteGame[]>();
  for (const g of games) {
    const r = g.round ?? 1;
    rounds.set(r, [...(rounds.get(r) ?? []), g]);
  }
  const ordered = [...rounds.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="cs-bracket">
      {ordered.map(([round, roundGames]) => (
        <div key={round} className="cs-bracket-round">
          <p className="label text-[10px]">{roundLabel(roundGames.length)}</p>
          <div className="cs-bracket-games">
            {roundGames.map((g) => {
              const decided = g.status === 'final' && g.homeScore != null && g.awayScore != null;
              const homeWon = decided && g.homeScore! > g.awayScore!;
              const awayWon = decided && g.awayScore! > g.homeScore!;
              return (
                <div key={g.id} className="cs-match">
                  <div className={`cs-match-team${homeWon ? ' cs-match-won' : ''}`}>
                    <span>{g.homeTeam}</span>
                    {decided && <b className="mono">{g.homeScore}</b>}
                  </div>
                  <div className={`cs-match-team${awayWon ? ' cs-match-won' : ''}`}>
                    <span>{g.awayTeam}</span>
                    {decided && <b className="mono">{g.awayScore}</b>}
                  </div>
                  <span className="cs-match-when">{decided ? (g.overtime ? 'Final · OT' : 'Final') : fmt(g.startsAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
