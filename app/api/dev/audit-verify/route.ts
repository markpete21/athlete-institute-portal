import { NextResponse } from 'next/server';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * DEV-ONLY: proves the audit pipeline end to end — audit() call → Supabase
 * sink (registered in instrumentation.ts) → audit_log row — and that the
 * brands table exists with its four seeds.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const marker = `verify_${Date.now()}`;

  try {
    // 1. audit() through the registered sink
    await audit({
      actorId: 'system:dev-verify',
      action: 'module0.verify',
      target: `audit:${marker}`,
      meta: { stage: 7, marker },
    });

    // 2. Row landed?
    const { data: rows, error } = await supabaseAdmin()
      .from('audit_log')
      .select('actor, action, target, meta, at')
      .eq('target', `audit:${marker}`)
      .limit(1);
    if (error) throw new Error(`audit_log read failed: ${error.message}`);
    record('audit() → audit_log row', rows.length === 1, rows[0] ? JSON.stringify(rows[0]).slice(0, 120) : 'no row found');

    // 3. Brands table seeded
    const { data: brands, error: bErr } = await supabaseAdmin()
      .from('brands')
      .select('key')
      .order('key');
    if (bErr) throw new Error(`brands read failed: ${bErr.message}`);
    const keys = (brands ?? []).map((b) => b.key);
    record(
      'brands table seeded',
      ['all-can', 'athlete-institute', 'bears', 'orangeville-prep'].every((k) => keys.includes(k)),
      keys.join(', '),
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
