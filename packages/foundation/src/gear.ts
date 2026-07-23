/**
 * Jersey / gear ordering (Module 4 Stage 5) - PURE, edge-safe.
 * The size scale, aggregated-order rollup, and jersey-number dedup used by
 * every program type.
 */

/** Youth 2XS -> Adult XXL, in order. */
export const JERSEY_SIZES = [
  'Y2XS', 'YXS', 'YS', 'YM', 'YL', 'YXL',
  'AXS', 'AS', 'AM', 'AL', 'AXL', 'AXXL',
] as const;
export type JerseySize = (typeof JERSEY_SIZES)[number];

export function isJerseySize(s: string): s is JerseySize {
  return (JERSEY_SIZES as readonly string[]).includes(s);
}

export interface GearOrderLine {
  size: JerseySize;
  participants: number; // count picked by registrants
  extras: number;       // staff buffer for this size
  total: number;        // participants + extras
}

/**
 * Aggregate a supplier order: participant sizes + per-size extras buffer ->
 * one line per size that has any count, in scale order. e.g. "12 YM, 8 AS...".
 */
export function aggregateGearOrder(
  participantSizes: string[],
  extrasBySize: Record<string, number> = {},
): GearOrderLine[] {
  const counts = new Map<string, number>();
  for (const s of participantSizes) counts.set(s, (counts.get(s) ?? 0) + 1);

  const lines: GearOrderLine[] = [];
  for (const size of JERSEY_SIZES) {
    const participants = counts.get(size) ?? 0;
    const extras = Math.max(0, Math.floor(extrasBySize[size] ?? 0));
    if (participants === 0 && extras === 0) continue;
    lines.push({ size, participants, extras, total: participants + extras });
  }
  return lines;
}

export function gearOrderTotals(lines: GearOrderLine[]): { participants: number; extras: number; total: number } {
  return lines.reduce(
    (acc, l) => ({ participants: acc.participants + l.participants, extras: acc.extras + l.extras, total: acc.total + l.total }),
    { participants: 0, extras: 0, total: 0 },
  );
}

/**
 * Resolve a jersey number given 1st/2nd choice and numbers already taken on the
 * team. Returns the assigned number, or null if BOTH choices collide (staff
 * resolve manually). Prevents duplicate numbers within a team (spec).
 */
export function resolveJerseyNumber(
  taken: number[],
  firstChoice: number | null,
  secondChoice: number | null,
): { assigned: number | null; usedSecond: boolean } {
  const set = new Set(taken);
  if (firstChoice != null && !set.has(firstChoice)) return { assigned: firstChoice, usedSecond: false };
  if (secondChoice != null && !set.has(secondChoice)) return { assigned: secondChoice, usedSecond: true };
  return { assigned: null, usedSecond: false };
}
