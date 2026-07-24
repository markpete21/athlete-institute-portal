import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { suppress } from '@/lib/comms/notifications';

/**
 * Campaign stats (Module 13 Stage 5) + Resend-webhook ingestion (Stage 9). Hard
 * bounces and unsubscribes auto-add to the suppression list so they drop out of
 * every future live-loaded audience with no manual scrubbing.
 */

export interface CampaignStats {
  campaignId: number;
  sent: number; delivered: number; bounced: number; opened: number; clicked: number; unsubscribed: number;
  openRate: number; clickRate: number;
  sentBy: string | null; sentAt: string | null;
}

export async function campaignStats(campaignId: number): Promise<CampaignStats> {
  const db = supabaseAdmin();
  const { data: c } = await db.from('comms_campaigns').select('sent_by, sent_at').eq('id', campaignId).single();
  const { data: recs } = await db.from('comms_recipients').select('status, opened_at, clicked_at').eq('campaign_id', campaignId);
  const rows = recs ?? [];
  const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;
  const sent = rows.length;
  const delivered = count((r) => ['delivered', 'opened', 'clicked'].includes(r.status));
  const opened = count((r) => !!r.opened_at);
  const clicked = count((r) => !!r.clicked_at);
  return {
    campaignId, sent,
    delivered, bounced: count((r) => r.status === 'bounced'), opened, clicked,
    unsubscribed: count((r) => r.status === 'unsubscribed'),
    openRate: sent ? opened / sent : 0, clickRate: sent ? clicked / sent : 0,
    sentBy: c?.sent_by ?? null, sentAt: c?.sent_at ?? null,
  };
}

export interface RecipientDetail { email: string; status: string; opened: boolean; clicked: boolean }

export async function recipientDetail(campaignId: number): Promise<RecipientDetail[]> {
  const { data } = await supabaseAdmin().from('comms_recipients').select('email, status, opened_at, clicked_at').eq('campaign_id', campaignId).order('email');
  return (data ?? []).map((r) => ({ email: r.email, status: r.status, opened: !!r.opened_at, clicked: !!r.clicked_at }));
}

/** Per-link click counts for a campaign. */
export async function linkClicks(campaignId: number): Promise<Array<{ url: string; clicks: number }>> {
  const { data } = await supabaseAdmin().from('comms_link_clicks').select('url').eq('campaign_id', campaignId);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.url, (counts.get(r.url) ?? 0) + 1);
  return [...counts.entries()].map(([url, clicks]) => ({ url, clicks })).sort((a, b) => b.clicks - a.clicks);
}

export type ResendEventType = 'email.delivered' | 'email.bounced' | 'email.opened' | 'email.clicked' | 'email.complained' | 'email.unsubscribed';

/**
 * Ingest one Resend webhook event: match the recipient (by message_id, else by
 * campaign+email), advance its status, record link clicks, and auto-suppress
 * hard bounces / unsubscribes / complaints.
 */
export async function ingestResendEvent(evt: { type: ResendEventType; messageId?: string | null; email?: string | null; campaignId?: number | null; url?: string | null }): Promise<boolean> {
  const db = supabaseAdmin();
  let recQuery = db.from('comms_recipients').select('id, campaign_id, email, opened_at, clicked_at');
  if (evt.messageId) recQuery = recQuery.eq('message_id', evt.messageId);
  else if (evt.campaignId && evt.email) recQuery = recQuery.eq('campaign_id', evt.campaignId).eq('email', evt.email);
  else return false;
  const { data: rec } = await recQuery.maybeSingle();
  if (!rec) return false;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  switch (evt.type) {
    case 'email.delivered': patch.status = 'delivered'; break;
    case 'email.opened': patch.status = 'opened'; if (!rec.opened_at) patch.opened_at = now; break;
    case 'email.clicked':
      patch.status = 'clicked'; if (!rec.clicked_at) patch.clicked_at = now; if (!rec.opened_at) patch.opened_at = now;
      if (evt.url) await db.from('comms_link_clicks').insert({ campaign_id: rec.campaign_id, recipient_id: rec.id, url: evt.url });
      break;
    case 'email.bounced': patch.status = 'bounced'; await suppress(rec.email, 'hard_bounce'); break;
    case 'email.complained': patch.status = 'unsubscribed'; await suppress(rec.email, 'complaint'); break;
    case 'email.unsubscribed': patch.status = 'unsubscribed'; await suppress(rec.email, 'unsubscribe'); break;
  }
  await db.from('comms_recipients').update(patch).eq('id', rec.id);
  return true;
}
