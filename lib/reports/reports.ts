import 'server-only';
import {
  agingBuckets, capacityLevel, conversionMetrics, marginBreakdown, periodStart,
  recognizeDeferredRevenue, revenueEarnedToDate, seasonRetentionRate, utilizationPct,
  revenuePerCourtHour, type AgingBuckets, type CapacityLevel, type ExpenseLine, type MarginResult, type Period,
} from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Reporting aggregations (Module 14). Live queries against own data; QBO
 * expenses come from the qbo_expenses cache (lib/quickbooks syncs it). Location
 * is a first-class dimension: every roll-up accepts locationId, and the three
 * canonical views work - definition-across-sites, single instance, all-at-location.
 */

// --- multi-location model ----------------------------------------------------

export interface ProgramInstance { id: number; name: string; locationId: number | null; locationName: string | null; definitionId: number }

/** Instances of one program DEFINITION across all locations (view 1). */
export async function definitionInstances(definitionId: number): Promise<ProgramInstance[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('programs').select('id, name, location_id, definition_id, locations(name)').or(`definition_id.eq.${definitionId},id.eq.${definitionId}`);
  return (data ?? []).map((p) => ({
    id: p.id, name: p.name, locationId: p.location_id,
    locationName: (p.locations as unknown as { name: string } | null)?.name ?? null,
    definitionId: p.definition_id ?? p.id,
  }));
}

/** All program instances at a location (view 3). */
export async function programsAtLocation(locationId: number): Promise<ProgramInstance[]> {
  const { data } = await supabaseAdmin().from('programs').select('id, name, location_id, definition_id, locations(name)').eq('location_id', locationId);
  return (data ?? []).map((p) => ({
    id: p.id, name: p.name, locationId: p.location_id,
    locationName: (p.locations as unknown as { name: string } | null)?.name ?? null,
    definitionId: p.definition_id ?? p.id,
  }));
}

// --- landing dashboard --------------------------------------------------------

export interface TopProgram { programId: number; name: string; count: number; revenueCents: number }

/** Top programs by registrations in a period (default 30d), optional location. */
export async function topProgramsByRegistration(period: Period, opts: { asOfISO?: string; locationId?: number | null; limit?: number } = {}): Promise<TopProgram[]> {
  const db = supabaseAdmin();
  const since = periodStart(period, opts.asOfISO ?? new Date().toISOString());
  let q = db.from('registrations').select('program_id, line_total_cents, programs!inner(name, location_id)').gte('created_at', since).in('status', ['active', 'waitlisted']);
  if (opts.locationId != null) q = q.eq('programs.location_id', opts.locationId);
  const { data } = await q;
  const agg = new Map<number, TopProgram>();
  for (const r of data ?? []) {
    const p = r.programs as unknown as { name: string };
    const cur = agg.get(r.program_id) ?? { programId: r.program_id, name: p.name, count: 0, revenueCents: 0 };
    cur.count += 1;
    cur.revenueCents += r.line_total_cents ?? 0;
    agg.set(r.program_id, cur);
  }
  return [...agg.values()].sort((a, b) => b.count - a.count).slice(0, opts.limit ?? 10);
}

export async function topProgramsByRevenue(period: Period, opts: { asOfISO?: string; locationId?: number | null; limit?: number } = {}): Promise<TopProgram[]> {
  const rows = await topProgramsByRegistration(period, { ...opts, limit: 1000 });
  return rows.sort((a, b) => b.revenueCents - a.revenueCents).slice(0, opts.limit ?? 10);
}

export interface OutstandingSummary { totalOutstandingCents: number; aging: AgingBuckets; orders: number }

/** Outstanding = pending installments on active-plan/overdue orders, aged. */
export async function outstandingBalances(asOfISO = new Date().toISOString()): Promise<OutstandingSummary> {
  const { data } = await supabaseAdmin()
    .from('program_installments')
    .select('amount_cents, due_date, status')
    .eq('status', 'pending');
  const invoices = (data ?? []).map((i) => ({ dueDate: i.due_date, balanceCents: i.amount_cents }));
  return {
    totalOutstandingCents: invoices.reduce((a, x) => a + x.balanceCents, 0),
    aging: agingBuckets(invoices, asOfISO),
    orders: invoices.length,
  };
}

// --- financial suite ----------------------------------------------------------

export interface RevenueCut { key: string; revenueCents: number; count: number }

/** Revenue by a dimension: program | type | brand | season | location. */
export async function revenueSummary(dim: 'program' | 'type' | 'brand' | 'season' | 'location', opts: { sinceISO?: string } = {}): Promise<RevenueCut[]> {
  const db = supabaseAdmin();
  let q = db.from('registrations').select('line_total_cents, programs!inner(name, brand_key, season_key, category, location_id, program_types(name), locations(name))').in('status', ['active']);
  if (opts.sinceISO) q = q.gte('created_at', opts.sinceISO);
  const { data } = await q;
  const agg = new Map<string, RevenueCut>();
  for (const r of data ?? []) {
    const p = r.programs as unknown as { name: string; brand_key: string; season_key: string | null; category: string; location_id: number | null; program_types: { name: string } | null; locations: { name: string } | null };
    const key = dim === 'program' ? p.name : dim === 'type' ? (p.program_types?.name ?? 'Unknown') : dim === 'brand' ? p.brand_key : dim === 'season' ? (p.season_key ?? 'unset') : (p.locations?.name ?? 'No location');
    const cur = agg.get(key) ?? { key, revenueCents: 0, count: 0 };
    cur.revenueCents += r.line_total_cents ?? 0;
    cur.count += 1;
    agg.set(key, cur);
  }
  return [...agg.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

/** Collected vs outstanding across program orders. */
export async function collectedVsOutstanding(): Promise<{ collectedCents: number; outstandingCents: number }> {
  const db = supabaseAdmin();
  const { data: paid } = await db.from('program_installments').select('amount_cents').eq('status', 'paid');
  const { data: pending } = await db.from('program_installments').select('amount_cents').eq('status', 'pending');
  return {
    collectedCents: (paid ?? []).reduce((a, i) => a + i.amount_cents, 0),
    outstandingCents: (pending ?? []).reduce((a, i) => a + i.amount_cents, 0),
  };
}

/** Discounts breakdown from orders (staff credit / promo / CoA / points). */
export async function discountsBreakdown(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin().from('program_orders').select('staff_credit_cents, promo_cents, credit_on_account_cents, play_points_used').neq('status', 'cancelled');
  const out = { staffCreditCents: 0, promoCents: 0, creditOnAccountCents: 0, playPointsCents: 0 };
  for (const o of data ?? []) {
    out.staffCreditCents += o.staff_credit_cents;
    out.promoCents += o.promo_cents;
    out.creditOnAccountCents += o.credit_on_account_cents;
    out.playPointsCents += o.play_points_used;
  }
  return out;
}

export interface PlanHealth { onTrack: number; behind: number; defaulted: number; atRiskCents: number }

/** Payment-plan health: behind = order w/ a failed or past-due pending installment. */
export async function paymentPlanHealth(asOfISO = new Date().toISOString()): Promise<PlanHealth> {
  const db = supabaseAdmin();
  const today = asOfISO.slice(0, 10);
  const { data: orders } = await db.from('program_orders').select('id, status').in('status', ['plan_active', 'overdue']);
  let onTrack = 0, behind = 0, defaulted = 0, atRiskCents = 0;
  for (const o of orders ?? []) {
    const { data: insts } = await db.from('program_installments').select('amount_cents, due_date, status').eq('order_id', o.id);
    const rows = insts ?? [];
    const failed = rows.filter((i) => i.status === 'failed');
    const pastDue = rows.filter((i) => i.status === 'pending' && i.due_date < today);
    if (o.status === 'overdue' || failed.length >= 2) { defaulted += 1; atRiskCents += rows.filter((i) => ['pending', 'failed'].includes(i.status)).reduce((a, i) => a + i.amount_cents, 0); }
    else if (failed.length || pastDue.length) { behind += 1; atRiskCents += [...failed, ...pastDue].reduce((a, i) => a + i.amount_cents, 0); }
    else onTrack += 1;
  }
  return { onTrack, behind, defaulted, atRiskCents };
}

/** Cash-flow forecast: expected pending installment income by month. */
export async function collectionsForecast(): Promise<Array<{ month: string; expectedCents: number }>> {
  const { data } = await supabaseAdmin().from('program_installments').select('amount_cents, due_date').eq('status', 'pending');
  const agg = new Map<string, number>();
  for (const i of data ?? []) agg.set(i.due_date.slice(0, 7), (agg.get(i.due_date.slice(0, 7)) ?? 0) + i.amount_cents);
  return [...agg.entries()].map(([month, expectedCents]) => ({ month, expectedCents })).sort((a, b) => a.month.localeCompare(b.month));
}

/** Margin for a program: revenue - staff cost (M5) - cached QBO expenses (by Class). */
export async function programMargin(programId: number, opts: { excludeCategories?: string[] } = {}): Promise<MarginResult> {
  const db = supabaseAdmin();
  const { programStaffCostCents } = await import('@/lib/staff/staff');
  const [{ data: regs }, staffCost, { data: prog }] = await Promise.all([
    db.from('registrations').select('line_total_cents').eq('program_id', programId).eq('status', 'active'),
    programStaffCostCents(programId),
    db.from('programs').select('quickbooks_class').eq('id', programId).single(),
  ]);
  const revenue = (regs ?? []).reduce((a, r) => a + (r.line_total_cents ?? 0), 0);
  let qboExpenses: ExpenseLine[] = [];
  if (prog?.quickbooks_class) {
    const { data: exp } = await db.from('qbo_expenses').select('category, amount_cents').eq('qbo_class', prog.quickbooks_class);
    const byCat = new Map<string, number>();
    for (const e of exp ?? []) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount_cents);
    qboExpenses = [...byCat.entries()].map(([category, amountCents]) => ({ category, amountCents }));
  }
  // Default double-count guard: staff pay is tracked in-system (M5), so QBO
  // wage categories are excluded unless the caller overrides.
  return marginBreakdown({ revenueCents: revenue, staffCostCents: staffCost, qboExpenses, excludeCategories: opts.excludeCategories ?? ['Staff Wages', 'Payroll', 'Payroll Expenses'] });
}

/** Deferred revenue schedule for an academy-style prepaid program. */
export { recognizeDeferredRevenue, revenueEarnedToDate };

// --- registration + demographics ----------------------------------------------

export interface RegistrationReport {
  total: number;
  byStanding: Record<string, number>;
  fillRate: number | null;
  waitlisted: number;
  conversion: ReturnType<typeof conversionMetrics>;
  marketingSources: Record<string, number>;
}

export async function registrationReport(programId: number): Promise<RegistrationReport> {
  const db = supabaseAdmin();
  const [{ data: regs }, { data: prog }, { count: carts }] = await Promise.all([
    db.from('registrations').select('status, standing, marketing_source').eq('program_id', programId),
    db.from('programs').select('capacity').eq('id', programId).single(),
    db.from('cart_items').select('id', { count: 'exact', head: true }).eq('program_id', programId),
  ]);
  const rows = regs ?? [];
  const active = rows.filter((r) => r.status === 'active').length;
  const byStanding: Record<string, number> = {};
  const marketingSources: Record<string, number> = {};
  for (const r of rows) {
    if (r.standing) byStanding[r.standing] = (byStanding[r.standing] ?? 0) + 1;
    if (r.marketing_source) marketingSources[r.marketing_source] = (marketingSources[r.marketing_source] ?? 0) + 1;
  }
  const started = rows.length + (carts ?? 0); // completed + still-in-cart
  return {
    total: rows.length,
    byStanding,
    fillRate: prog?.capacity ? active / prog.capacity : null,
    waitlisted: rows.filter((r) => r.status === 'waitlisted').length,
    conversion: conversionMetrics({ started, completed: rows.length }),
    marketingSources,
  };
}

export { seasonRetentionRate };

// --- capacity nudges ------------------------------------------------------------

export interface CapacityAlert { programId: number; name: string; level: CapacityLevel; active: number; capacity: number | null; waitlisted: number }

/** Programs at/approaching capacity (dashboard cards + next-login notification). */
export async function capacityAlerts(): Promise<CapacityAlert[]> {
  const db = supabaseAdmin();
  const { data: programs } = await db.from('programs').select('id, name, capacity').in('status', ['registration_open', 'published', 'full']);
  const out: CapacityAlert[] = [];
  for (const p of programs ?? []) {
    const { data: nudge } = await db.from('capacity_nudges').select('threshold_pct').eq('program_id', p.id).maybeSingle();
    const { count: active } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', p.id).eq('status', 'active');
    const { count: waitlisted } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', p.id).eq('status', 'waitlisted');
    const level = capacityLevel({ active: active ?? 0, capacity: p.capacity, waitlisted: waitlisted ?? 0, thresholdPct: nudge?.threshold_pct ?? 80 });
    if (level !== 'ok') out.push({ programId: p.id, name: p.name, level, active: active ?? 0, capacity: p.capacity, waitlisted: waitlisted ?? 0 });
  }
  return out;
}

// --- facility utilization ---------------------------------------------------------

export interface UtilizationRow { facilityId: number; name: string; bookedHours: number; availableHours: number; pct: number; byType: Record<string, number> }

/** Utilization % per facility over a window, split by booking type. */
export async function facilityUtilization(startISO: string, endISO: string, opts: { hoursPerDay?: number } = {}): Promise<UtilizationRow[]> {
  const db = supabaseAdmin();
  const { data: facilities } = await db.from('facilities').select('id, name, bookable').eq('bookable', true).is('deleted_at', null);
  const { data: bookings } = await db
    .from('bookings').select('facility_id, starts_at, ends_at, source')
    .is('canceled_at', null).gte('starts_at', startISO).lt('starts_at', endISO);
  const days = Math.max(1, Math.round((Date.parse(endISO) - Date.parse(startISO)) / 86_400_000));
  const available = days * (opts.hoursPerDay ?? 15); // default 08:00-23:00

  const out: UtilizationRow[] = [];
  for (const f of facilities ?? []) {
    const mine = (bookings ?? []).filter((b) => b.facility_id === f.id);
    const byType: Record<string, number> = {};
    let booked = 0;
    for (const b of mine) {
      const hrs = (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 3_600_000;
      booked += hrs;
      byType[b.source] = (byType[b.source] ?? 0) + hrs;
    }
    out.push({ facilityId: f.id, name: f.name, bookedHours: Math.round(booked * 10) / 10, availableHours: available, pct: utilizationPct(booked, available), byType });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

export { revenuePerCourtHour };
