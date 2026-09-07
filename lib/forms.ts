/**
 * FormData parsing for server actions — the one vocabulary every action uses
 * to read a posted form, so a field is never coerced three different ways.
 *
 * All readers are total: a missing or blank field yields the documented
 * fallback rather than `NaN` / `'null'` / `'undefined'`. The `*OrThrow`
 * variants are for required fields; they throw a `FormError` whose message is
 * safe to surface to the user.
 *
 * Pure — no server-only imports, so the helpers are unit-testable and usable
 * from route handlers that receive multipart bodies.
 */

export class FormError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'FormError';
  }
}

type Entry = FormDataEntryValue | null | undefined;

/** Trimmed string; blank → `''`. */
export function str(v: Entry): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Trimmed string; blank → `null`. */
export function strOrNull(v: Entry): string | null {
  return str(v) || null;
}

/** Trimmed string; blank → `fallback`. */
export function strOr(v: Entry, fallback: string): string {
  return str(v) || fallback;
}

/** Required trimmed string. */
export function strOrThrow(v: Entry, label: string): string {
  const s = str(v);
  if (!s) throw new FormError(`${label} is required.`, label);
  return s;
}

/** Finite number; blank or non-numeric → `null`. */
export function num(v: Entry): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Finite number; blank or non-numeric → `fallback`. */
export function numOr(v: Entry, fallback: number): number {
  return num(v) ?? fallback;
}

/** Integer; blank or non-integer → `null`. */
export function int(v: Entry): number | null {
  const n = num(v);
  return n !== null && Number.isInteger(n) ? n : null;
}

/** Required positive integer — the shape of every row id posted from a form. */
export function id(v: Entry, label = 'id'): number {
  const n = int(v);
  if (n === null || n <= 0) throw new FormError(`Missing or invalid ${label}.`, label);
  return n;
}

/** Optional positive integer id; blank → `null`. */
export function idOrNull(v: Entry): number | null {
  const n = int(v);
  return n !== null && n > 0 ? n : null;
}

/** Dollars-and-cents string ("12.50") → integer cents; blank/non-numeric → `null`. */
export function cents(v: Entry): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n * 100);
}

/** Dollars string → integer cents; blank/non-numeric → `0`. */
export function centsOrZero(v: Entry): number {
  return cents(v) ?? 0;
}

/** Checkbox / toggle: `'on'`, `'true'`, `'1'`, `'yes'` are true; anything else false. */
export function bool(v: Entry): boolean {
  const s = str(v).toLowerCase();
  return s === 'on' || s === 'true' || s === '1' || s === 'yes';
}

/** `YYYY-MM-DD` (from `<input type="date">`); blank or malformed → `null`. */
export function dateOrNull(v: Entry): string | null {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** `HH:MM` (from `<input type="time">`); blank or malformed → `null`. */
export function timeOrNull(v: Entry): string | null {
  const s = str(v);
  return /^\d{2}:\d{2}(:\d{2})?$/.test(s) ? s.slice(0, 5) : null;
}

/** A value constrained to a known set of literals; anything else → `fallback`. */
export function oneOf<T extends string>(v: Entry, allowed: readonly T[], fallback: T): T {
  const s = str(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/** Like `oneOf` but required: an unknown value throws. */
export function oneOfOrThrow<T extends string>(v: Entry, allowed: readonly T[], label: string): T {
  const s = str(v);
  if (!(allowed as readonly string[]).includes(s)) throw new FormError(`Invalid ${label}.`, label);
  return s as T;
}

/** Every value posted under `name` (multi-select / repeated checkboxes), trimmed and non-blank. */
export function strList(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(str).filter(Boolean);
}

/** Every positive-integer id posted under `name`. */
export function idList(formData: FormData, name: string): number[] {
  return strList(formData, name)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** JSON-encoded hidden field; malformed → `fallback`. */
export function json<T>(v: Entry, fallback: T): T {
  const s = str(v);
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** A posted file with content, or `null` for the empty `<input type="file">` case. */
export function file(v: Entry): File | null {
  return v instanceof File && v.size > 0 ? v : null;
}
