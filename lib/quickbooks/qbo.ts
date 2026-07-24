import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * QuickBooks Online sync (Module 14 Stage 3). OAuth2 connection, revenue PUSH
 * (invoices -> QBO, idempotent on source_ref), expense PULL (cached in
 * qbo_expenses for margin views; QBO API is rate-limited so we never query it
 * live). Mapping: program -> QBO Class, location -> QBO Location.
 *
 * Needs QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REDIRECT_URI env vars + Mark
 * connecting via the OAuth consent screen. All functions degrade gracefully
 * (return {connected:false}) until then, so reports still render.
 */

const QBO_BASE = process.env.QBO_ENV === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';

export interface QboStatus { connected: boolean; realmId: string | null; lastSyncAt: string | null }

export async function qboStatus(): Promise<QboStatus> {
  const { data } = await supabaseAdmin().from('qbo_connection').select('realm_id, access_token, last_sync_at').eq('id', 1).maybeSingle();
  return { connected: !!data?.access_token, realmId: data?.realm_id ?? null, lastSyncAt: data?.last_sync_at ?? null };
}

/** The Intuit consent URL to start OAuth (staff visits this). */
export function qboAuthUrl(): string | null {
  const clientId = process.env.QBO_CLIENT_ID;
  const redirect = process.env.QBO_REDIRECT_URI;
  if (!clientId || !redirect) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirect,
    state: 'qbo-connect',
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params}`;
}

/** Exchange the OAuth code (from the callback) and store tokens. */
export async function qboExchangeCode(code: string, realmId: string): Promise<void> {
  const clientId = process.env.QBO_CLIENT_ID;
  const secret = process.env.QBO_CLIENT_SECRET;
  const redirect = process.env.QBO_REDIRECT_URI;
  if (!clientId || !secret || !redirect) throw new Error('QBO env vars not configured.');
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`QBO token exchange failed: ${res.status}`);
  const tok = await res.json();
  await supabaseAdmin().from('qbo_connection').upsert({
    id: 1, realm_id: realmId, access_token: tok.access_token, refresh_token: tok.refresh_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(), connected_at: new Date().toISOString(),
  });
}

/** Valid access token (refreshes if expired). Null when not connected. */
async function accessToken(): Promise<{ token: string; realmId: string } | null> {
  const db = supabaseAdmin();
  const { data: c } = await db.from('qbo_connection').select('*').eq('id', 1).maybeSingle();
  if (!c?.access_token || !c.realm_id) return null;
  if (c.expires_at && Date.parse(c.expires_at) > Date.now() + 60_000) return { token: c.access_token, realmId: c.realm_id };

  const clientId = process.env.QBO_CLIENT_ID;
  const secret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !secret || !c.refresh_token) return null;
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const tok = await res.json();
  await db.from('qbo_connection').update({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString() }).eq('id', 1);
  return { token: tok.access_token, realmId: c.realm_id };
}

/**
 * PUSH revenue: create a QBO SalesReceipt for a paid program order (idempotent
 * on source_ref). Class = program's quickbooks_class, Location via DepartmentRef.
 */
export async function pushRevenue(input: { sourceRef: string; amountCents: number; memo: string; qboClass?: string | null; qboLocation?: string | null }, actorClerkId: string): Promise<{ pushed: boolean; reason?: string }> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from('qbo_revenue_pushes').select('id').eq('source_ref', input.sourceRef).maybeSingle();
  if (existing) return { pushed: false, reason: 'already pushed' };

  const auth = await accessToken();
  if (!auth) {
    // Log locally so the push can be replayed once connected.
    await db.from('qbo_revenue_pushes').insert({ source_ref: input.sourceRef, amount_cents: input.amountCents, qbo_class: input.qboClass ?? null, qbo_location: input.qboLocation ?? null, qbo_id: null });
    return { pushed: false, reason: 'not connected - queued locally' };
  }

  const res = await fetch(`${QBO_BASE}/v3/company/${auth.realmId}/salesreceipt`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      Line: [{ Amount: input.amountCents / 100, DetailType: 'SalesItemLineDetail', Description: input.memo, SalesItemLineDetail: { ...(input.qboClass ? { ClassRef: { name: input.qboClass } } : {}) } }],
      ...(input.qboLocation ? { DepartmentRef: { name: input.qboLocation } } : {}),
      PrivateNote: input.sourceRef,
    }),
    cache: 'no-store',
  });
  if (!res.ok) return { pushed: false, reason: `QBO error ${res.status}` };
  const json = await res.json();
  await db.from('qbo_revenue_pushes').insert({ source_ref: input.sourceRef, qbo_id: json.SalesReceipt?.Id ?? null, amount_cents: input.amountCents, qbo_class: input.qboClass ?? null, qbo_location: input.qboLocation ?? null });
  await audit({ actorId: actorClerkId, action: 'qbo.revenue-pushed', target: input.sourceRef, meta: { amountCents: input.amountCents } });
  return { pushed: true };
}

/**
 * PULL expenses: query QBO Purchases and cache them in qbo_expenses (nightly
 * cron + on-demand). Upserts on qbo_id so re-syncs are idempotent.
 */
export async function pullExpenses(actorClerkId: string): Promise<{ synced: number; connected: boolean }> {
  const db = supabaseAdmin();
  const auth = await accessToken();
  if (!auth) return { synced: 0, connected: false };

  const query = encodeURIComponent("select * from Purchase maxresults 1000");
  const res = await fetch(`${QBO_BASE}/v3/company/${auth.realmId}/query?query=${query}`, {
    headers: { authorization: `Bearer ${auth.token}`, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return { synced: 0, connected: true };
  const json = await res.json();
  const purchases = json.QueryResponse?.Purchase ?? [];
  let synced = 0;
  for (const p of purchases) {
    for (const line of p.Line ?? []) {
      const detail = line.AccountBasedExpenseLineDetail;
      if (!detail) continue;
      await db.from('qbo_expenses').upsert({
        qbo_id: `${p.Id}:${line.Id}`,
        txn_date: p.TxnDate ?? null,
        category: detail.AccountRef?.name ?? 'Uncategorized',
        amount_cents: Math.round((line.Amount ?? 0) * 100),
        qbo_class: detail.ClassRef?.name ?? null,
        qbo_location: p.DepartmentRef?.name ?? null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'qbo_id' });
      synced += 1;
    }
  }
  await db.from('qbo_connection').update({ last_sync_at: new Date().toISOString() }).eq('id', 1);
  await audit({ actorId: actorClerkId, action: 'qbo.expenses-synced', target: 'qbo', meta: { synced } });
  return { synced, connected: true };
}
