/**
 * Superstat API v1 shapes (https://docs.superstatsport.com/docs), as far as
 * this app reads them. Pure types: shared by the client, the mapper and its
 * tests. Everything is read from one team's point of view: `team` is the
 * side that uploaded the footage when both teams belong to our club.
 */
export type SsMatchStatus = 'not_started' | 'in_progress' | 'processing' | 'complete' | 'failed';

export interface SsClub { id: string; name: string }
export interface SsTeam { id: string; clubId: string; name: string; ageGroup: string | null; gender: string | null; competitionLevel?: string | null; league?: string | null; division?: string | null }
export interface SsRosterPlayer { id: string; firstName: string | null; lastName: string | null; jerseyNumber: string | null }
export interface SsSide { id: string | null; name: string; score: number | null }
export interface SsPeriod { id: string; number: number; type: string; startedAt: string | null; endedAt: string | null }
export interface SsMatch {
  id: string; playedAt: string | null; status: SsMatchStatus; team: SsSide; opponent: SsSide;
  recordedBy: 'team' | 'opponent'; opponentStatsTracked: boolean; thumbnailUrl?: string | null; failureReason: string | null; periods: SsPeriod[]; createdAt?: string;
}

export interface SsTotals {
  points: number; fieldGoalsMade: number; fieldGoalsAttempted: number; threePointersMade: number; threePointersAttempted: number; freeThrowsMade: number; freeThrowsAttempted: number;
  offensiveRebounds: number; defensiveRebounds: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; fouls: number;
}
export interface SsBoxPlayer extends SsTotals { playerId: string | null; rosterEntryId: string | null; name: string | null; jerseyNumber: string | null; minutes: number | null; efficiency?: number | null }
export interface SsBoxSide { name: string; totals: SsTotals; players: SsBoxPlayer[] }
export interface SsBoxScore { matchId: string; team: SsBoxSide; opponent: SsBoxSide }

export interface SsEvent {
  id: string; type: string; success: boolean | null; side: 'team' | 'opponent'; matchSeconds: number | null;
  periodId: string | null; periodNumber: number | null; periodType: string | null; periodSeconds: number | null;
  player: { id: string | null; rosterEntryId: string | null; name: string | null; jerseyNumber: string | null } | null;
  location: { x: number; y: number } | null; customEventName: string | null;
}
export interface SsEvents { roster: unknown[]; events: SsEvent[] }

export type SsInsightStatus = 'ready' | 'not_generated' | 'generating' | 'failed' | 'unavailable';
export interface SsInsights {
  status: SsInsightStatus; message?: string; stale?: boolean;
  summary?: { whatsWorking?: string[]; focusAreas?: string[]; suggestions?: string[] } | null;
  ratings?: Record<string, { value: number; comment: string }> | null; generatedAt?: string | null;
}
