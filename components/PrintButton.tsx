'use client';

/** Browser print = the brand-styled PDF export (print CSS on the page). */
export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={() => window.print()}>
      {label}
    </button>
  );
}
