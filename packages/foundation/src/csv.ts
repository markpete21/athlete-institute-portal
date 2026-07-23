/**
 * Minimal RFC-4180 CSV parser (Module 1 Stage 5) — PURE, no deps.
 * Handles quoted fields, escaped quotes (""), commas/newlines inside quotes,
 * CRLF/LF, and a header row. Enough for the Playbook export; not a general
 * streaming parser (7k rows is fine in memory).
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => {
    // skip fully-empty trailing lines
    if (record.length > 1 || record[0]?.trim() !== '') records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushField(); pushRecord();
    } else if (c === '\r') {
      // swallow (CRLF handled by the \n branch)
    } else {
      field += c;
    }
  }
  if (field.length > 0 || record.length > 0) { pushField(); pushRecord(); }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = records.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}
