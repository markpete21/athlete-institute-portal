'use client';

/**
 * Opens the browser print dialog, where "Save as PDF" produces the actual
 * downloadable file. A client component because window.print() cannot be
 * called from a server component.
 */
export function PrintButton() {
  return (
    <button type="button" className="btn-gold btn-sm" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
