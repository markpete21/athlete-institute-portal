'use client';

import { useEffect, type ReactNode } from 'react';

/** Hard-cornered modal over a scrim; Escape + backdrop click close it. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-lg animate-fade-in border border-hairline bg-paper"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-xl">{title}</h2>
          <button onClick={onClose} className="label text-[11px] hover:text-ink" aria-label="Close">
            Close ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-hairline px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
