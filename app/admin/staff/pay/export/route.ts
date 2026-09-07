import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireStaffCapability } from '@/lib/auth';
import { payRows, qbPayoutCsv } from '@/lib/staff/staff';

export const dynamic = 'force-dynamic';

/**
 * QuickBooks payout CSV (Module 5 Stage 5) - one row per pay date in the
 * window, mapped to the program's QuickBooks class. Tracking export only;
 * importing it into QuickBooks/payroll is where money actually moves.
 * Format documented in docs/staff-pay.md.
 */
export async function GET(req: NextRequest) {
  // Every staff rate in one file — gated by the Module 5 pay capability.
  try {
    await requireStaffCapability('pay', 'view');
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'signed_out' ? 401 : 403 });
    }
    throw err;
  }

  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const rows = await payRows({ fromISO: from, toISO: to });
  const csv = qbPayoutCsv(rows);
  const name = `staff-payouts${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
