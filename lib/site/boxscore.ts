/**
 * Box-score parsing for site-run leagues (pure: no server imports, so it is
 * unit-tested directly). Accepts what a scorekeeper pastes:
 *
 *  - a table with a header row, tab- or space-separated, e.g. Superstat's
 *      Player # PTS REB AST STL BLK TO FG FG% 3PT 3P% FT FT%
 *      #15 15 14 3 2 1 0 1 6-11 54.5 1-4 25.0 1-1 100.0
 *      TEAM 66 41 13 11 0 22 29-75 38.7 4-20 20.0 4-11 36.4
 *    (player names may contain spaces; the stat columns are read from the
 *    right, so "Jalen Carter 15 14 …" works too)
 *  - a one-line team summary, e.g.
 *      Opposition 47 PTS FG 19-51 (37.3%) 3PT 2-9 (22.2%) FT 7-13 (53.8%) 31 REB 7 AST 6 STL 0 BLK 20 TO
 *
 * The core of every line (pts, reb, ast) is the Compete portal's
 * game_stat_lines shape, so a season moves into Compete row for row.
 */
export interface BoxLine {
  number: string | null;
  name: string | null;
  isTotal: boolean;
  pts: number; reb: number; ast: number;
  stl: number | null; blk: number | null; tov: number | null;
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null;
  oreb: number | null;
  min: string | null;
}

export interface ParsedBox { lines: BoxLine[]; total: BoxLine | null; warnings: string[] }

const blank = (): BoxLine => ({ number: null, name: null, isTotal: false, pts: 0, reb: 0, ast: 0, stl: null, blk: null, tov: null, fgm: null, fga: null, tpm: null, tpa: null, ftm: null, fta: null, oreb: null, min: null });

const ALIASES: Record<string, string> = {
  player: 'player', name: 'player', players: 'player',
  '#': 'number', no: 'number', 'no.': 'number', num: 'number', number: 'number', jersey: 'number',
  pts: 'pts', points: 'pts', p: 'pts',
  reb: 'reb', rebs: 'reb', rebounds: 'reb', tr: 'reb', trb: 'reb',
  oreb: 'oreb', or: 'oreb', off: 'oreb',
  ast: 'ast', asts: 'ast', assists: 'ast', a: 'ast',
  stl: 'stl', steals: 'stl', st: 'stl',
  blk: 'blk', blocks: 'blk', bs: 'blk',
  to: 'tov', tov: 'tov', turnovers: 'tov',
  fg: 'fg', fgm: 'fgm', fga: 'fga',
  '3pt': 'tp', '3p': 'tp', '3pm': 'tpm', '3pa': 'tpa', tpm: 'tpm', tpa: 'tpa',
  ft: 'ft', ftm: 'ftm', fta: 'fta',
  min: 'min', mins: 'min', minutes: 'min',
};

const int = (v: string | undefined): number | null => {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t === '-' || t === '–') return null;
  const n = Number(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
};
const pair = (v: string | undefined): [number | null, number | null] => {
  const m = (v ?? '').trim().match(/^(\d+)\s*[-/]\s*(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
};

/** "47 PTS FG 19-51 (37.3%) 3PT 2-9 … 20 TO" -> a totals line. */
export function parseSummaryLine(text: string): BoxLine | null {
  const t = text.replace(/\s+/g, ' ');
  const n = (re: RegExp) => { const m = t.match(re); return m ? Number(m[1]) : null; };
  const pts = n(/(\d+)\s*PTS\b/i);
  if (pts == null) return null;
  const sh = (lab: string) => { const m = t.match(new RegExp(`\\b${lab}\\s+(\\d+)\\s*-\\s*(\\d+)`, 'i')); return m ? [Number(m[1]), Number(m[2])] : [null, null]; };
  const [fgm, fga] = sh('FG'), [tpm, tpa] = sh('3PT'), [ftm, fta] = sh('FT');
  return { ...blank(), isTotal: true, name: 'TEAM', pts, reb: n(/(\d+)\s*REB\b/i) ?? 0, ast: n(/(\d+)\s*AST\b/i) ?? 0, stl: n(/(\d+)\s*STL\b/i), blk: n(/(\d+)\s*BLK\b/i), tov: n(/(\d+)\s*TO\b/i), fgm, fga, tpm, tpa, ftm, fta };
}

export function parseBoxScore(text: string): ParsedBox {
  const warnings: string[] = [];
  const rows = text.split(/\r?\n/).map((r) => r.replace(/ /g, ' ').trimEnd()).filter((r) => r.trim());
  const hi = rows.findIndex((r) => /\bpts\b/i.test(r) && /\b(player|name|#)\b/i.test(r) && !/\d+\s*PTS/i.test(r));
  if (hi < 0) {
    // No table: maybe a single summary line.
    const sum = rows.map(parseSummaryLine).find(Boolean) ?? null;
    if (!sum) warnings.push('No box score found. Paste the table with its header row, or the one-line team summary.');
    return { lines: [], total: sum, warnings };
  }
  const tabbed = rows[hi].includes('\t');
  const split = (r: string) => (tabbed ? r.split('\t').map((c) => c.trim()) : r.trim().split(/\s+/));
  const header = split(rows[hi]).map((h) => ALIASES[h.toLowerCase()] ?? `x:${h.toLowerCase()}`);
  if (header[0] !== 'player') warnings.push('The first column should be the player.');
  const statCols = header.slice(1);
  const lines: BoxLine[] = [];
  let total: BoxLine | null = null;
  for (const r of rows.slice(hi + 1)) {
    const cells = split(r);
    if (cells.length < 2) continue;
    // Name is everything left of the stat columns (names can contain spaces).
    let values: string[], who: string;
    if (tabbed) { who = cells[0]; values = cells.slice(1); }
    else {
      // A TEAM row often leaves the # column empty: one value short.
      const short = cells.length - statCols.length === 0 && statCols[0] === 'number';
      values = short ? ['', ...cells.slice(1)] : cells.slice(cells.length - statCols.length);
      who = short ? cells[0] : cells.slice(0, cells.length - statCols.length).join(' ');
    }
    const get = (k: string) => { const i = statCols.indexOf(k); return i >= 0 ? values[i] : undefined; };
    const line = blank();
    const isTotal = /^(team|totals?)$/i.test(who.trim());
    line.isTotal = isTotal;
    const num = (get('number') ?? '').replace(/^#/, '').trim() || (who.match(/^#?(\d{1,3})$/)?.[1] ?? '');
    line.number = isTotal ? null : num || null;
    line.name = isTotal ? 'TEAM' : (/^#?\d{1,3}$/.test(who.trim()) ? null : who.trim() || null);
    line.pts = int(get('pts')) ?? 0; line.reb = int(get('reb')) ?? 0; line.ast = int(get('ast')) ?? 0;
    line.stl = int(get('stl')); line.blk = int(get('blk')); line.tov = int(get('tov')); line.oreb = int(get('oreb'));
    [line.fgm, line.fga] = get('fg') !== undefined ? pair(get('fg')) : [int(get('fgm')), int(get('fga'))];
    [line.tpm, line.tpa] = get('tp') !== undefined ? pair(get('tp')) : [int(get('tpm')), int(get('tpa'))];
    [line.ftm, line.fta] = get('ft') !== undefined ? pair(get('ft')) : [int(get('ftm')), int(get('fta'))];
    line.min = get('min')?.trim() || null;
    if (!isTotal && !line.number && !line.name) { warnings.push(`Skipped a row with no player: "${r.trim().slice(0, 40)}"`); continue; }
    if (isTotal) total = line; else lines.push(line);
  }
  // A summary line anywhere in the paste can stand in for a missing TEAM row.
  if (!total) total = rows.slice(0, hi).map(parseSummaryLine).find(Boolean) ?? null;
  if (total && lines.length) {
    const sum = lines.reduce((a, l) => a + l.pts, 0);
    if (sum !== total.pts) warnings.push(`Player points add up to ${sum}, the team total says ${total.pts}.`);
  }
  return { lines, total, warnings };
}

/** Totals for a team: the uploaded TEAM row, else the sum of the player lines. */
export function teamTotals(lines: BoxLine[], total: BoxLine | null): BoxLine | null {
  if (total) return total;
  if (!lines.length) return null;
  const add = (k: keyof BoxLine) => { const v = lines.map((l) => l[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  return { ...blank(), isTotal: true, name: 'TEAM', pts: add('pts') ?? 0, reb: add('reb') ?? 0, ast: add('ast') ?? 0, stl: add('stl'), blk: add('blk'), tov: add('tov'), fgm: add('fgm'), fga: add('fga'), tpm: add('tpm'), tpa: add('tpa'), ftm: add('ftm'), fta: add('fta'), oreb: add('oreb') };
}

/** Top lines for the schedule preview: points, then rebounds, then assists. */
export const topLines = <T extends BoxLine>(lines: T[], n = 5): T[] => [...lines].sort((a, b) => b.pts - a.pts || b.reb - a.reb || b.ast - a.ast).slice(0, n);

export const pct = (m: number | null, a: number | null) => (m == null || a == null || a === 0 ? null : Math.round((m / a) * 1000) / 10);
