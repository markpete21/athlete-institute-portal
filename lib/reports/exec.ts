import 'server-only';
import { formatCAD, monthInReviewWindow, weekInReviewWindow } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { capacityAlerts, outstandingBalances, topProgramsByRegistration, topProgramsByRevenue } from '@/lib/reports/reports';

/**
 * Auto exec reports (Module 14 Stage 6): one engine, two templates. Week-in-
 * review (each Monday, prior Mon-Sun) + month-in-review (prior month), emailed
 * to the configurable exec list as a brand-themed HTML report (print -> PDF;
 * a dedicated PDF renderer can swap in without changing this interface).
 */

export interface ExecReportData {
  title: string;
  windowLabel: string;
  registrations: number;
  revenueCents: number;
  topByRegistration: Array<{ name: string; count: number }>;
  topByRevenue: Array<{ name: string; revenueCents: number }>;
  outstandingCents: number;
  capacityAlerts: number;
}

async function windowMetrics(startISO: string, endISO: string): Promise<{ registrations: number; revenueCents: number }> {
  const { data } = await supabaseAdmin()
    .from('registrations')
    .select('line_total_cents')
    .gte('created_at', `${startISO}T00:00:00Z`)
    .lte('created_at', `${endISO}T23:59:59Z`)
    .in('status', ['active', 'waitlisted']);
  return { registrations: (data ?? []).length, revenueCents: (data ?? []).reduce((a, r) => a + (r.line_total_cents ?? 0), 0) };
}

export async function buildExecReport(kind: 'week' | 'month', asOfISO = new Date().toISOString()): Promise<ExecReportData> {
  const window = kind === 'week' ? weekInReviewWindow(asOfISO) : monthInReviewWindow(asOfISO);
  const [{ registrations, revenueCents }, topReg, topRev, outstanding, alerts] = await Promise.all([
    windowMetrics(window.startISO, window.endISO),
    topProgramsByRegistration(kind === 'week' ? '7d' : '30d', { asOfISO, limit: 5 }),
    topProgramsByRevenue(kind === 'week' ? '7d' : '30d', { asOfISO, limit: 5 }),
    outstandingBalances(asOfISO),
    capacityAlerts(),
  ]);
  return {
    title: kind === 'week' ? 'Week in Review' : 'Month in Review',
    windowLabel: `${window.startISO} to ${window.endISO}`,
    registrations,
    revenueCents,
    topByRegistration: topReg.map((t) => ({ name: t.name, count: t.count })),
    topByRevenue: topRev.map((t) => ({ name: t.name, revenueCents: t.revenueCents })),
    outstandingCents: outstanding.totalOutstandingCents,
    capacityAlerts: alerts.length,
  };
}

export function renderExecHtml(d: ExecReportData): string {
  const row = (l: string, v: string) => `<tr><td style="padding:6px 12px;color:#666">${l}</td><td style="padding:6px 12px;font-weight:bold;text-align:right">${v}</td></tr>`;
  return [
    `<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto">`,
    `<h1 style="border-bottom:2px solid #9E8959;padding-bottom:8px">${d.title}<span style="color:#9E8959">.</span></h1>`,
    `<p style="color:#666">${d.windowLabel}</p>`,
    `<table width="100%" style="border-collapse:collapse">`,
    row('New registrations', String(d.registrations)),
    row('Revenue booked', formatCAD(d.revenueCents)),
    row('Outstanding balances', formatCAD(d.outstandingCents)),
    row('Capacity alerts', String(d.capacityAlerts)),
    `</table>`,
    `<h2 style="margin-top:24px">Top programs by registration</h2>`,
    `<ol>${d.topByRegistration.map((t) => `<li>${t.name} — ${t.count}</li>`).join('')}</ol>`,
    `<h2>Top programs by revenue</h2>`,
    `<ol>${d.topByRevenue.map((t) => `<li>${t.name} — ${formatCAD(t.revenueCents)}</li>`).join('')}</ol>`,
    `</div>`,
  ].join('\n');
}

/** Email the exec report to every configured recipient for this cadence. */
export async function sendExecReport(kind: 'week' | 'month', asOfISO = new Date().toISOString()): Promise<{ recipients: number }> {
  const db = supabaseAdmin();
  const data = await buildExecReport(kind, asOfISO);
  const html = renderExecHtml(data);
  const { data: recips } = await db.from('exec_recipients').select('email').eq(kind === 'week' ? 'weekly' : 'monthly', true);
  for (const r of recips ?? []) {
    await notify({ to: { email: r.email }, channels: ['email'], template: 'generic', data: { heading: `${data.title} — ${data.windowLabel}`, body: html } });
  }
  return { recipients: (recips ?? []).length };
}
