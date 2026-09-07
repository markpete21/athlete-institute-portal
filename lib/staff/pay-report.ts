import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { Staff, StaffEmployment } from '@/lib/staff/records';

/** Pay reporting + the QuickBooks payout CSV (tracking export only). */

// --- Pay reporting + QuickBooks export ---------------------------------------

export interface PayReportRow {
  id: number;
  dueDate: string;
  amountCents: number;
  status: 'outstanding' | 'paid';
  paidAt: string | null;
  staffId: number;
  staffName: string;
  staffEmail: string | null;
  employment: StaffEmployment | null;
  programId: number;
  programName: string;
  quickbooksClass: string | null;
}

export async function payRows(filter?: { fromISO?: string; toISO?: string }): Promise<PayReportRow[]> {
  let q = supabaseAdmin()
    .from('staff_pay_dates')
    .select('id, due_date, amount_cents, status, paid_at, staff_assignments(program_id, staff(id, first_name, last_name, email, employment), programs(id, name, quickbooks_class))')
    .order('due_date');
  if (filter?.fromISO) q = q.gte('due_date', filter.fromISO);
  if (filter?.toISO) q = q.lte('due_date', filter.toISO);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const a = r.staff_assignments as unknown as {
      program_id: number;
      staff: { id: number; first_name: string; last_name: string; email: string | null; employment: StaffEmployment | null } | null;
      programs: { id: number; name: string; quickbooks_class: string | null } | null;
    } | null;
    return {
      id: r.id,
      dueDate: r.due_date,
      amountCents: r.amount_cents,
      status: r.status as 'outstanding' | 'paid',
      paidAt: r.paid_at,
      staffId: a?.staff?.id ?? 0,
      staffName: a?.staff ? `${a.staff.first_name} ${a.staff.last_name}` : '-',
      staffEmail: a?.staff?.email ?? null,
      employment: a?.staff?.employment ?? null,
      programId: a?.programs?.id ?? a?.program_id ?? 0,
      programName: a?.programs?.name ?? '-',
      quickbooksClass: a?.programs?.quickbooks_class ?? null,
    };
  });
}

const csvCell = (v: string | number | null) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * QuickBooks payout export (documented in docs/staff-pay.md): one row per pay
 * date in the window. Tracking only - importing this into QuickBooks/payroll
 * is where money actually moves.
 */
export function qbPayoutCsv(rows: PayReportRow[]): string {
  const header = 'DueDate,Staff,Email,Classification,Program,QuickBooksClass,AmountCAD,Status,PaidAt';
  const lines = rows.map((r) =>
    [r.dueDate, r.staffName, r.staffEmail ?? '', r.employment ?? '', r.programName, r.quickbooksClass ?? '', (r.amountCents / 100).toFixed(2), r.status, r.paidAt ? r.paidAt.slice(0, 10) : '']
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\n');
}
