'use client';

import { useEffect, useRef } from 'react';

/**
 * A text link that opens an image (e.g. a campus parking map) in a dialog on
 * the same page. Esc, the Close button or a click outside the image closes
 * it; focus returns to the link.
 */
export default function ImageDialog({ label, src }: { label: string; src: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => { if (e.target === d) d.close(); };
    d.addEventListener('click', onClick);
    return () => d.removeEventListener('click', onClick);
  }, []);
  return (
    <>
      <button type="button" className="img-dialog-link" aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="img-dialog" aria-label={label}>
        <div className="img-dialog-head">
          <span className="label">{label}</span>
          <button type="button" className="x" onClick={() => ref.current?.close()}>Close<i aria-hidden="true" /></button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} />
      </dialog>
    </>
  );
}
