import { Children, cloneElement, isValidElement, useId, type ComponentProps, type ReactNode } from 'react';

/**
 * Mono silver field label + control (Vanguard form primitives). When the
 * caller gives no `htmlFor`, the label is wired to the single child control by
 * a generated id, so every Field is a real label/control pair for screen
 * readers and click-to-focus.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const controlId = htmlFor ?? (isValidElement<{ id?: string }>(only) ? only.props.id ?? generated : undefined);
  const control = !htmlFor && isValidElement<{ id?: string; 'aria-invalid'?: boolean }>(only) && !only.props.id
    ? cloneElement(only, { id: generated, ...(error ? { 'aria-invalid': true } : {}) })
    : children;
  return (
    <div className="flex flex-col">
      <label htmlFor={controlId} className="field-label">
        {label}
      </label>
      {control}
      {error ? (
        <span className="mt-1 text-xs text-neg" role="alert">{error}</span>
      ) : hint ? (
        <span className="mt-1 text-xs text-silver">{hint}</span>
      ) : null}
    </div>
  );
}

// The spread comes FIRST so a caller's className is merged with `.input`
// rather than replacing it (the previous order silently unstyled any input
// that passed its own class).
export function Input({ className = '', ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={`input ${className}`.trim()} />;
}

export function Select({ className = '', ...rest }: ComponentProps<'select'>) {
  return <select {...rest} className={`input ${className}`.trim()} />;
}

export function Textarea({ className = '', ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={`input ${className}`.trim()} />;
}

/** Status tones shared with the `.pill-status` CSS variants. */
export type StatusTone = 'neutral' | 'accent' | 'pos' | 'neg' | 'warn' | 'ink' | 'muted';

const PILL_CLASS: Record<StatusTone, string> = {
  neutral: 'tag',
  accent: 'pill-status gold',
  pos: 'pill-status pos',
  neg: 'pill-status neg',
  warn: 'pill-status warn',
  ink: 'pill-status ink',
  muted: 'pill-status muted',
};

/** One status pill for every domain — colour never lives in page files. */
export function Status({ children, tone = 'neutral', className = '', title }: { children: ReactNode; tone?: StatusTone; className?: string; title?: string }) {
  return <span className={`${PILL_CLASS[tone]} ${className}`.trim()} title={title}>{children}</span>;
}

/** @deprecated use <Status tone> — kept for the UI kit demo. */
export function Badge({ children, tone }: { children: ReactNode; tone?: 'silver' | 'pos' | 'neg' }) {
  return <Status tone={tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : 'neutral'}>{children}</Status>;
}
