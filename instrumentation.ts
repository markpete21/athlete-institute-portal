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

    // Rental installment settlement: Stripe webhook -> billing event ->
    // mark the matching installment paid/failed (PAD settles asynchronously).
    const { onBillingEvent } = await import('@ai/foundation');
    const { markInstallmentFailed, markInstallmentPaid } = await import('@/lib/rentals/payments');
    onBillingEvent('payment.succeeded', async (e) => {
      const id = Number(e.metadata.installment_id);
      if (id) await markInstallmentPaid(id, 'system:webhook');
    });
    onBillingEvent('payment.failed', async (e) => {
      const id = Number(e.metadata.installment_id);
      if (id) await markInstallmentFailed(id, e.failureMessage ?? 'payment failed', 'system:webhook');
    });
  }
}
