import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cronRoute } from '@/lib/api/handlers';
import { openCase, processDunning, retryInstallmentCharge } from '@/lib/dunning/dunning';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Dunning cron (Module 18A), daily: open cases for any newly-failed program
 * installments, then advance every open case through the escalation ladder.
 */
export const GET = cronRoute(async () => {
  // Sweep failed installments into cases (idempotent per installment).
  const { data: failed } = await supabaseAdmin().from('program_installments').select('id').eq('status', 'failed');
  let opened = 0;
  for (const f of failed ?? []) if (await openCase(f.id)) opened += 1;

  const result = await processDunning({ retryCharge: retryInstallmentCharge });
  return NextResponse.json({ ok: true, opened, ...result });
});
