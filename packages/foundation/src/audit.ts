/**
 * Audit logging (Module 0 §9) — the shared "who did what, when" trail sensitive
 * actions across modules write to: refunds, overrides, permission changes,
 * deletions, brand applies, staff-credit adjustments.
 *
 * Edge-safe surface. A pluggable SINK does the persistence: the default logs to
 * the console so the API is usable from day one; when the portal's Supabase is
 * wired, Module 1 registers a DB sink (an `audit_log` table) via setAuditSink()
 * — no call site changes. Recording an audit entry must never throw into the
 * business action, so writes are best-effort.
 */

export interface AuditEntry {
  /** Clerk user id of the actor (or a system tag like 'system:webhook'). */
  actorId: string;
  /** Dotted action, e.g. 'refund.issued', 'role.granted', 'booking.deleted'. */
  action: string;
  /** What was acted on, e.g. 'registration:reg_123'. */
  target?: string;
  /** Structured context (amounts, before/after, reason). */
  meta?: Record<string, unknown>;
  /** ISO timestamp; defaulted at write time if omitted. */
  at?: string;
}

export type AuditSink = (entry: Required<Pick<AuditEntry, 'at'>> & AuditEntry) => void | Promise<void>;

const consoleSink: AuditSink = (entry) => {
  console.log(
    `[audit] ${entry.at} ${entry.actorId} ${entry.action}` +
      (entry.target ? ` → ${entry.target}` : '') +
      (entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''),
  );
};

/**
 * The sink lives on globalThis, not module state: Next compiles
 * instrumentation.ts (which registers the DB sink) in a separate module graph
 * from routes, so a module-level variable would be a different instance per
 * graph and the registration would silently not apply to callers.
 */
const SINK_KEY = '__aiAuditSink';

/** Swap the persistence sink (instrumentation.ts registers the Supabase one). */
export function setAuditSink(next: AuditSink): void {
  (globalThis as Record<string, unknown>)[SINK_KEY] = next;
}

function currentSink(): AuditSink {
  return ((globalThis as Record<string, unknown>)[SINK_KEY] as AuditSink | undefined) ?? consoleSink;
}

/**
 * Record an audit entry (best-effort — a sink failure is logged, never thrown,
 * so it can't roll back the action being audited). The caller stamps `at` via
 * the app's Toronto clock if it wants a specific timezone; otherwise now().
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const stamped = { ...entry, at: entry.at ?? new Date().toISOString() };
  try {
    await currentSink()(stamped);
  } catch (err) {
    console.error('[audit] sink failed (entry NOT persisted):', err, stamped);
  }
}
