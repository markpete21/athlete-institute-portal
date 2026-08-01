'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The schedule header's date: click to open the native calendar and jump to
 * any date. Renders the friendly label; the invisible input on top carries
 * the picker.
 */
export function DateJump({ date, baseQuery }: { date: string; baseQuery: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const friendly = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <button
      type="button"
      className="relative mono whitespace-nowrap border-b border-dotted border-silver text-sm text-ink hover:border-current"
      title="Jump to a date"
      onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
    >
      {friendly}
      <span className="ml-2 text-silver">{date}</span>
      <input
        ref={inputRef}
        type="date"
        value={date}
        tabIndex={-1}
        aria-label="Jump to date"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
            const p = new URLSearchParams(baseQuery);
            p.set('date', e.target.value);
            router.push(`/schedule?${p.toString()}`);
          }
        }}
      />
    </button>
  );
}
