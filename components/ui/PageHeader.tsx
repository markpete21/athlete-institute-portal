import type { ReactNode } from 'react';

/**
 * The portal page header: mono kicker, display title with the brand-accent
 * full stop, optional lede and right-aligned actions. One component instead
 * of ~85 hand-typed copies, so size, spacing and the dot stay consistent.
 */
export function PageHeader({
  kicker,
  title,
  lede,
  actions,
  size = 'lg',
  className = '',
}: {
  kicker?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const h1 = size === 'sm' ? 'text-3xl' : size === 'md' ? 'text-4xl' : 'text-5xl';
  return (
    <header className={`flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6 ${className}`.trim()}>
      <div className="flex flex-col gap-2">
        {kicker && <p className="label text-[11px]">{kicker}</p>}
        <h1 className={h1}>
          {title}
          <span className="text-accent">.</span>
        </h1>
        {lede && <p className="text-body">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Quiet empty state: one sentence, optional action. */
export function EmptyState({ children, action, className = '' }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`card flex flex-col items-start gap-3 p-6 ${className}`.trim()}>
      <p className="text-sm text-body">{children}</p>
      {action}
    </div>
  );
}

/** KPI tile: label, big value, optional delta/footnote. */
export function Stat({ label, value, delta, tone = 'neutral', className = '' }: { label: ReactNode; value: ReactNode; delta?: ReactNode; tone?: 'neutral' | 'pos' | 'neg'; className?: string }) {
  const deltaCls = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-silver';
  return (
    <div className={`kpi ${className}`.trim()}>
      <span className="kpi-k">{label}</span>
      <b className="kpi-v">{value}</b>
      {delta && <span className={`kpi-d ${deltaCls}`}>{delta}</span>}
    </div>
  );
}
