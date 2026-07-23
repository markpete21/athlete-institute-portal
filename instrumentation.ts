/**
 * Next.js instrumentation — runs once per server boot. Wires the audit-log
 * sink to Supabase (console remains the fallback inside audit() on failure).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setAuditSink } = await import('@ai/foundation');
    const { supabaseAdmin } = await import('@ai/foundation/supabase');

    setAuditSink(async (entry) => {
      const { error } = await supabaseAdmin().from('audit_log').insert({
        actor: entry.actorId,
        action: entry.action,
        target: entry.target ?? null,
        meta: entry.meta ?? {},
        at: entry.at,
      });
      if (error) throw new Error(`audit_log insert failed: ${error.message}`);
    });
  }
}
