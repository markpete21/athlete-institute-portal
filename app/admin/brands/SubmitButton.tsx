'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Submit button that reports its own progress: idle → "Saving…" while the
 * server action runs → "Saved" for a couple of seconds → back to idle.
 *
 * useFormStatus() only works inside the <form> it belongs to, so this must be a
 * child of the form element (not the component that renders the form).
 */
export function SubmitButton({
  children,
  pendingLabel = 'Saving…',
  doneLabel = 'Saved',
  className = 'btn-ghost btn-sm',
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  doneLabel?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  const [justDone, setJustDone] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      // The action finished — flash the confirmation, then settle back.
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), 2200);
      return () => clearTimeout(t);
    }
    wasPending.current = pending;
  }, [pending]);

  const label = pending ? pendingLabel : justDone ? doneLabel : children;

  return (
    <button
      className={className}
      disabled={pending}
      formAction={formAction}
      aria-busy={pending}
      style={pending ? { opacity: 0.65 } : justDone ? { borderColor: '#3f7a5b', color: '#3f7a5b' } : undefined}
    >
      {pending && <span className="brand-spinner" aria-hidden />}
      {label}
      {justDone && !pending && <span aria-hidden> ✓</span>}
    </button>
  );
}

/** Live region so screen readers hear the state change, not just see it. */
export function SaveStatus() {
  const { pending } = useFormStatus();
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {pending ? 'Saving' : ''}
    </span>
  );
}
