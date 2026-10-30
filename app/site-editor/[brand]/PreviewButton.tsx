'use client';

import { useTransition } from 'react';
import { previewUrlAction } from '../actions';

/** Opens the public site with a one-hour preview token so drafts render as they will publish. */
export function PreviewButton({ brand, path = '/', label = 'Preview', className = 'btn-ghost btn-sm' }: { brand: string; path?: string; label?: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={className} disabled={pending} onClick={() => start(async () => { const url = await previewUrlAction(brand, path); window.open(url, '_blank', 'noopener'); })}>
      {pending ? 'Opening…' : label}
    </button>
  );
}
