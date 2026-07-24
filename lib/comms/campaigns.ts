import 'server-only';
import { abSplit, audit, renderBlocks, spamCheck, type EmailBlock } from '@ai/foundation';
import { notify, type NotifyChannel } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { resolveAudience, type SegmentDefinition } from '@/lib/comms/segments';

/**
 * Campaign lifecycle (Module 13 Stages 1/4/5). Draft -> scheduled -> sending ->
 * sent (or canceled). Audience is resolved LIVE at send time. A/B splits the
 * audience deterministically. Sends go through Module 0 notify(); per-recipient
 * rows are created for Resend-webhook stats ingestion.
 */

export interface CampaignInput {
  name: string;
  kind?: 'email' | 'announcement';
  brandKey?: string | null;
  subject?: string | null;
  blocks?: EmailBlock[];
  bodyText?: string | null;
  channels?: NotifyChannel[];
  fromEmail?: string | null;
  replyTo?: string | null;
  listId?: number | null;
  audience?: SegmentDefinition | null;
  isMarketing?: boolean;
  abTest?: { variantB: { subject?: string; blocks?: EmailBlock[] }; splitPercent: number } | null;
}

export async function createCampaign(input: CampaignInput, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from('comms_campaigns').insert({
    name: input.name.trim(), kind: input.kind ?? 'email', brand_key: input.brandKey ?? null, subject: input.subject ?? null,
    blocks: input.blocks ?? [], body_text: input.bodyText ?? null, channels: input.channels ?? ['email'],
    from_email: input.fromEmail ?? null, reply_to: input.replyTo ?? null, list_id: input.listId ?? null,
    audience: input.audience ?? null, is_marketing: input.isMarketing ?? true, ab_test: input.abTest ?? null,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'comms.campaign-created', target: `campaign:${data.id}` });
  return data.id;
}

/** Schedule (or reschedule) a campaign. Only draft/scheduled can be scheduled. */
export async function scheduleCampaign(campaignId: number, whenISO: string, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: c } = await db.from('comms_campaigns').select('status').eq('id', campaignId).single();
  if (!c || !['draft', 'scheduled'].includes(c.status)) throw new Error('Only a draft or scheduled campaign can be scheduled.');
  const { error } = await db.from('comms_campaigns').update({ status: 'scheduled', scheduled_at: whenISO }).eq('id', campaignId);
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'comms.campaign-scheduled', target: `campaign:${campaignId}`, meta: { whenISO } });
}

/** Cancel a scheduled campaign (back to draft). Sent campaigns can't be canceled. */
export async function cancelScheduled(campaignId: number, actorClerkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: c } = await db.from('comms_campaigns').select('status').eq('id', campaignId).single();
  if (!c || c.status !== 'scheduled') throw new Error('Only a scheduled campaign can be canceled.');
  await db.from('comms_campaigns').update({ status: 'draft', scheduled_at: null }).eq('id', campaignId);
  await audit({ actorId: actorClerkId, action: 'comms.campaign-canceled', target: `campaign:${campaignId}` });
}

/** Pre-send spam check on the composed campaign (before the required test email). */
export async function preSendSpamCheck(campaignId: number): Promise<ReturnType<typeof spamCheck>> {
  const db = supabaseAdmin();
  const { data: c } = await db.from('comms_campaigns').select('subject, blocks, is_marketing').eq('id', campaignId).single();
  if (!c) throw new Error('Campaign not found.');
  const html = renderBlocks((c.blocks ?? []) as EmailBlock[]);
  return spamCheck({ subject: c.subject ?? '', html, isMarketing: c.is_marketing });
}

async function loadDefinition(db: ReturnType<typeof supabaseAdmin>, listId: number | null, inline: SegmentDefinition | null): Promise<SegmentDefinition> {
  if (inline) return inline;
  if (listId) {
    const { data: list } = await db.from('comms_lists').select('definition').eq('id', listId).single();
    return (list?.definition ?? { include: [] }) as SegmentDefinition;
  }
  return { include: [] };
}

export interface SendResult { campaignId: number; recipientCount: number; variants: { A: number; B: number } }

/**
 * Send a campaign NOW: resolve the live audience, apply the A/B split if any,
 * render per-recipient (merge tags), create recipient rows, and dispatch via
 * notify(). Idempotent-ish: refuses if already sent/sending.
 */
export async function sendCampaign(campaignId: number, actorClerkId: string): Promise<SendResult> {
  const db = supabaseAdmin();
  const { data: c, error } = await db.from('comms_campaigns').select('*').eq('id', campaignId).single();
  if (error) throw new Error(error.message);
  if (['sent', 'sending'].includes(c.status)) throw new Error('Campaign already sent.');

  await db.from('comms_campaigns').update({ status: 'sending' }).eq('id', campaignId);

  const def = await loadDefinition(db, c.list_id, c.audience as SegmentDefinition | null);
  const recipients = await resolveAudience(def);

  // A/B assignment (by email) or single variant.
  const abTest = c.ab_test as CampaignInput['abTest'];
  let variantByEmail = new Map<string, 'A' | 'B' | null>();
  if (abTest) {
    const { a, b } = abSplit(recipients.map((r) => r.email), abTest.splitPercent);
    const bSet = new Set(b as string[]);
    const aSet = new Set(a as string[]);
    for (const r of recipients) variantByEmail.set(r.email, aSet.has(r.email) ? 'A' : bSet.has(r.email) ? 'B' : null);
  }

  const channels = (c.channels ?? ['email']) as NotifyChannel[];
  let countA = 0, countB = 0;
  for (const r of recipients) {
    const variant = variantByEmail.get(r.email) ?? null;
    if (variant === 'A') countA += 1; else if (variant === 'B') countB += 1;
    const subject = variant === 'B' && abTest?.variantB.subject ? abTest.variantB.subject : c.subject;
    const blocks = (variant === 'B' && abTest?.variantB.blocks ? abTest.variantB.blocks : c.blocks) as EmailBlock[];
    const mergeData = { first_name: r.firstName ?? '', brand: c.brand_key ?? '' };
    const html = c.kind === 'announcement' ? (c.body_text ?? '') : renderBlocks(blocks, mergeData);

    const { data: rec } = await db.from('comms_recipients').insert({ campaign_id: campaignId, profile_id: r.profileId, email: r.email, variant, status: 'queued' }).select('id').single();

    // Best-effort dispatch (skips cleanly when Resend/Twilio unconfigured).
    const res = await notify({ to: { email: r.email }, channels, template: 'generic', data: { heading: subject ?? '', body: html } });
    const sent = res.results.some((x) => x.status === 'sent');
    await db.from('comms_recipients').update({ status: sent ? 'sent' : 'queued' }).eq('id', rec!.id);
  }

  await db.from('comms_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), sent_by: actorClerkId }).eq('id', campaignId);
  await audit({ actorId: actorClerkId, action: 'comms.campaign-sent', target: `campaign:${campaignId}`, meta: { recipients: recipients.length } });
  return { campaignId, recipientCount: recipients.length, variants: { A: countA, B: countB } };
}

/** Cron: send any scheduled campaign whose time has arrived. */
export async function processDueCampaigns(actorClerkId = 'system:cron'): Promise<number[]> {
  const db = supabaseAdmin();
  const { data: due } = await db.from('comms_campaigns').select('id').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString());
  const sent: number[] = [];
  for (const c of due ?? []) { await sendCampaign(c.id, actorClerkId); sent.push(c.id); }
  return sent;
}

/** Decide + persist the A/B winner from collected stats. */
export async function finalizeAbWinner(campaignId: number): Promise<'A' | 'B' | 'tie' | null> {
  const { pickAbWinner } = await import('@ai/foundation');
  const db = supabaseAdmin();
  const { data: recs } = await db.from('comms_recipients').select('variant, status, opened_at, clicked_at').eq('campaign_id', campaignId);
  const tally = (v: 'A' | 'B') => {
    const rows = (recs ?? []).filter((r) => r.variant === v);
    return { sent: rows.length, opened: rows.filter((r) => r.opened_at).length, clicked: rows.filter((r) => r.clicked_at).length };
  };
  if (!(recs ?? []).some((r) => r.variant)) return null;
  const winner = pickAbWinner(tally('A'), tally('B'));
  await db.from('comms_campaigns').update({ ab_winner: winner }).eq('id', campaignId);
  return winner;
}
