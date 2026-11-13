/**
 * Per-game jersey fixes (pure). The season roster is the default identity for
 * a jersey number; a fix says that in one game the jersey tagged as `worn`
 * was really someone else (jerseys change, numbers get misread), or is not a
 * player. Fixes are applied when stats are read, so a re-sync never loses them.
 */
export interface JerseyFix { gameId: number; team: string; worn: string; asNumber: string | null; asName: string | null; hidden: boolean }

interface LineLike { gameId: number; team: string; isTotal: boolean; number: string | null; name: string | null }
interface EventLike { gameId: number; team: string; number: string | null; name: string | null }

/** How a line is keyed for a fix: its jersey number, or its name when it has none. */
export const wornKey = (number: string | null, name: string | null) => (number && number.trim() ? number.trim().replace(/^#/, '') : `~${(name ?? '').trim().toLowerCase()}`);

const fixIndex = (fixes: JerseyFix[]) => new Map(fixes.map((f) => [`${f.gameId}|${f.team}|${f.worn}`, f]));

const SUM = ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'oreb', 'dreb', 'pf', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta'] as const;

/** Two lines that turn out to be one player in one game become one line. */
function merge<T extends LineLike>(a: T, b: T): T {
  const out = { ...a } as Record<string, unknown>;
  const x = a as unknown as Record<string, unknown>, y = b as unknown as Record<string, unknown>;
  for (const k of SUM) out[k] = x[k] == null && y[k] == null ? null : Number(x[k] ?? 0) + Number(y[k] ?? 0);
  const mins = [x.min, y.min].map((m) => (m == null || m === '' ? null : Number(m)));
  if (mins.some((m) => m != null && Number.isFinite(m))) out.min = String(Math.round(mins.reduce<number>((n, m) => n + (m != null && Number.isFinite(m) ? m : 0), 0) * 10) / 10);
  return out as T;
}

/**
 * Apply the fixes to stat lines: rename / renumber, drop hidden lines, and
 * merge lines that end up as the same player in the same game. Team total
 * rows are never touched.
 */
export function applyJerseyFixes<T extends LineLike>(lines: T[], fixes: JerseyFix[]): T[] {
  if (!fixes.length) return lines;
  const idx = fixIndex(fixes);
  const out: T[] = [];
  const seen = new Map<string, number>();
  for (const l of lines) {
    if (l.isTotal) { out.push(l); continue; }
    const f = idx.get(`${l.gameId}|${l.team}|${wornKey(l.number, l.name)}`);
    if (f?.hidden) continue;
    const next = f ? { ...l, number: f.asNumber ?? l.number, name: f.asName ?? l.name } : l;
    // Only a fixed line can collide with another; untouched lines stay as they were entered.
    const key = `${next.gameId}|${next.team}|${wornKey(next.number, next.name)}`;
    const at = seen.get(key);
    if (at != null && (f || fixesTouch(idx, out[at]))) { out[at] = merge(out[at], next); continue; }
    seen.set(key, out.length);
    out.push(next);
  }
  return out;
}
const fixesTouch = (idx: Map<string, JerseyFix>, l: LineLike) => [...idx.values()].some((f) => f.gameId === l.gameId && f.team === l.team && !f.hidden && wornKey(f.asNumber ?? f.worn, f.asName) === wornKey(l.number, l.name));

/** The same fixes on plays: a hidden jersey keeps its play (the basket still counted) but loses the player. */
export function applyJerseyFixesToEvents<E extends EventLike>(events: E[], fixes: JerseyFix[]): E[] {
  if (!fixes.length) return events;
  const idx = fixIndex(fixes);
  return events.map((e) => {
    if (!e.number) return e;
    const f = idx.get(`${e.gameId}|${e.team}|${wornKey(e.number, null)}`);
    if (!f) return e;
    return f.hidden ? { ...e, number: null, name: null } : { ...e, number: f.asNumber ?? e.number, name: f.asName ?? e.name };
  });
}

/** What the editor's dropdown posts: "" (as roster), "hide", "other", or "r:<number>|<name>". */
export function parsePick(pick: string, typedNumber: string, typedName: string): { asNumber: string | null; asName: string | null; hidden: boolean } | null {
  const clean = (v: string) => v.trim().replace(/^#/, '').slice(0, 120) || null;
  if (pick === 'hide') return { asNumber: null, asName: null, hidden: true };
  if (pick.startsWith('r:')) { const [n, ...rest] = pick.slice(2).split('|'); return { asNumber: clean(n), asName: clean(rest.join('|')), hidden: false }; }
  if (pick === 'other') { const n = clean(typedNumber), nm = clean(typedName); return n || nm ? { asNumber: n, asName: nm, hidden: false } : null; }
  return null;
}
