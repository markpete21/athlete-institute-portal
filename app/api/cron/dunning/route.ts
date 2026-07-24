import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { openCase, processDunning } from '@/lib/dunning/dunning';

export const dynamic = 'force-dynamic';

/**
 * Dunning cron (Module 18A), daily: open cases for any newly-failed program
 * installments, then advance every open case through the escalation ladder.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Sweep failed installments into cases (idempotent per installment).
  const { data: failed } = await supabaseAdmin().from('program_installments').select('id').eq('status', 'failed');
  let opened = 0;
  for (const f of failed ?? []) if (await openCase(f.id)) opened += 1;

  const result = await processDunning();
  return NextResponse.json({ ok: true, opened, ...result });
}
