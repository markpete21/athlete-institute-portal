/**
 * League registration helpers (Module 7) - PURE, edge-safe.
 */

export type LeaguePath = 'captain' | 'member' | 'small_group' | 'free_agent';
export type LeaguePricing = 'player' | 'team' | 'both';

/** A join link is open until 2 weeks after season start AND the team isn't full. */
export function joinLinkOpen(input: {
  expiresAtISO: string | null;
  memberCount: number;
  maxPlayers: number | null;
  nowISO: string;
}): { open: boolean; reason: 'open' | 'expired' | 'full' } {
  if (input.maxPlayers != null && input.memberCount >= input.maxPlayers) return { open: false, reason: 'full' };
  if (input.expiresAtISO && input.nowISO > input.expiresAtISO) return { open: false, reason: 'expired' };
  return { open: true, reason: 'open' };
}

/** Join-link expiry = 2 weeks after the season start date. */
export function joinLinkExpiry(seasonStartISO: string): string {
  const [y, m, d] = seasonStartISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 14)).toISOString();
}

/**
 * The fee for a registrant given the league pricing model + path. A captain
 * paying the team rate covers the whole team (teammates then pay $0 when they
 * join); everyone else pays the per-player fee.
 */
export function leagueLineCents(input: {
  pricing: LeaguePricing;
  path: LeaguePath;
  playerFeeCents: number;
  teamRateCents: number;
  captainPaysTeam: boolean; // captain chose to pay the team rate
}): number {
  if (input.path === 'captain' && input.captainPaysTeam && (input.pricing === 'team' || input.pricing === 'both')) {
    return input.teamRateCents;
  }
  if (input.path === 'member' && input.captainPaysTeam) return 0; // team already paid by captain
  return input.playerFeeCents;
}

/** A small group is complete once everyone named has registered. */
export function smallGroupComplete(expectedNames: string[], registeredCount: number): boolean {
  // expectedNames includes teammates typed by the first member; the group is
  // the first member + the named teammates.
  return registeredCount >= expectedNames.length + 1;
}

/** Best-effort name match: normalize + compare (staff confirm mismatches). */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}
export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
