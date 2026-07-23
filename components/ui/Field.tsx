import type { ComponentProps, ReactNode } from 'react';

/** Mono silver field label + input (Vanguard form primitives). */
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
  return (
    <div className="flex flex-col">
      <label htmlFor={htmlFor} className="field-label">
        {label}
      </label>
      {children}
      {error ? (
        <span className="mt-1 text-xs text-neg">{error}</span>
      ) : hint ? (
        <span className="mt-1 text-xs text-silver">{hint}</span>
      ) : null}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input className={`input ${props.className ?? ''}`} {...props} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select className={`input ${props.className ?? ''}`} {...props} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea className={`input ${props.className ?? ''}`} {...props} />;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'silver' | 'pos' | 'neg' }) {
  const toneCls = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : '';
  return <span className={`tag ${toneCls}`}>{children}</span>;
}
