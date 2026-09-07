import 'server-only';
import { abSplit, audit, renderBlocks, spamCheck, type EmailBlock } from '@ai/foundation';
import { notify, type NotifyChannel } from '@ai/foundation/notify';
import { ok, rows, supabaseAdmin } from '@ai/foundation/supabase';
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

export interface SendResult { campaignId: number; recipientCount: number; variants: { A: number; B: number }; remaining: number }

/** How long one send/drain call keeps working before handing the rest to the cron. */
const DRAIN_BUDGET_MS = 40_000;
const DRAIN_BATCH = 50;

/**
 * Send a campaign: resolve the live audience, apply the A/B split, QUEUE one
 * recipient row per person, then drain the queue within a time budget. What
 * is left stays `sending` and the hourly comms cron (`drainSendingCampaigns`)
 * finishes it — a 7,000-recipient blast no longer has to fit in one request,
 * and a timeout resumes instead of wedging the campaign.
 *
 * Idempotent: a campaign already `sent` is refused; one already `sending`
 * resumes its queue (no new recipient rows are created).
 */
export async function sendCampaign(campaignId: number, actorClerkId: string): Promise<SendResult> {
  const db = supabaseAdmin();
  const { data: c, error } = await db.from('comms_campaigns').select('*').eq('id', campaignId).single();
  if (error) throw new Error(error.message);
  if (c.status === 'sent') throw new Error('Campaign already sent.');

  let countA = 0, countB = 0, recipientCount = 0;
  if (c.status !== 'sending') {
    ok(await db.from('comms_campaigns').update({ status: 'sending' }).eq('id', campaignId), 'campaign.sending');

    const def = await loadDefinition(db, c.list_id, c.audience as SegmentDefinition | null);
    const recipients = await resolveAudience(def);

    // A/B assignment (by email) or single variant.
    const abTest = c.ab_test as CampaignInput['abTest'];
    const variantByEmail = new Map<string, 'A' | 'B' | null>();
    if (abTest) {
      const { a, b } = abSplit(recipients.map((r) => r.email), abTest.splitPercent);
      const bSet = new Set(b as string[]);
      const aSet = new Set(a as string[]);
      for (const r of recipients) variantByEmail.set(r.email, aSet.has(r.email) ? 'A' : bSet.has(r.email) ? 'B' : null);
    }
    const queue = recipients.map((r) => {
      const variant = variantByEmail.get(r.email) ?? null;
      if (variant === 'A') countA += 1; else if (variant === 'B') countB += 1;
      return { campaign_id: campaignId, profile_id: r.profileId, email: r.email, variant, status: 'queued' };
    });
    recipientCount = queue.length;
    for (let i = 0; i < queue.length; i += 500) {
      ok(await db.from('comms_recipients').insert(queue.slice(i, i + 500)), 'campaign.queue');
    }
    await audit({ actorId: actorClerkId, action: 'comms.campaign-queued', target: `campaign:${campaignId}`, meta: { recipients: recipientCount, A: countA, B: countB } });
  } else {
    const { count } = await db.from('comms_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId);
    recipientCount = count ?? 0;
  }

  const remaining = await drainCampaign(campaignId, actorClerkId, DRAIN_BUDGET_MS);
  return { campaignId, recipientCount, variants: { A: countA, B: countB }, remaining };
}

/** Everything needed to render one recipient's email for a campaign. */
async function loadRenderContext(campaignId: number) {
  const { data: c, error } = await supabaseAdmin().from('comms_campaigns').select('*').eq('id', campaignId).single();
  if (error) throw new Error(error.message);
  const abTest = c.ab_test as CampaignInput['abTest'];
  const channels = (c.channels ?? ['email']) as NotifyChannel[];
  const render = (variant: 'A' | 'B' | null, firstName: string | null) => {
    const subject = variant === 'B' && abTest?.variantB.subject ? abTest.variantB.subject : c.subject;
    const blocks = (variant === 'B' && abTest?.variantB.blocks ? abTest.variantB.blocks : c.blocks) as EmailBlock[];
    const mergeData = { first_name: firstName ?? '', brand: c.brand_key ?? '' };
    // Announcements are plain text (escaped by the template); campaigns are built HTML.
    return c.kind === 'announcement'
      ? { subject: subject ?? '', body: c.body_text ?? '', bodyIsHtml: false }
      : { subject: subject ?? '', body: renderBlocks(blocks, mergeData), bodyIsHtml: true };
  };
  return { campaign: c, channels, render };
}

/**
 * Dispatch queued recipients for one campaign until the queue is empty or the
 * time budget is spent. Records the provider message id on each row so the
 * Resend webhook can match opens/bounces back. Returns how many remain.
 */
export async function drainCampaign(campaignId: number, actorClerkId: string, budgetMs = DRAIN_BUDGET_MS): Promise<number> {
  const db = supabaseAdmin();
  const ctx = await loadRenderContext(campaignId);
  const startedAt = Date.now();

  while (Date.now() - startedAt < budgetMs) {
    const batch = rows(
      await db.from('comms_recipients').select('id, email, variant, profiles(first_name)').eq('campaign_id', campaignId).eq('status', 'queued').order('id').limit(DRAIN_BATCH),
      'campaign.batch',
    );
    if (batch.length === 0) break;
    for (const r of batch) {
      const firstName = (r.profiles as unknown as { first_name: string | null } | null)?.first_name ?? null;
      const { subject, body, bodyIsHtml } = ctx.render(r.variant as 'A' | 'B' | null, firstName);
      const res = await notify({ to: { email: r.email }, channels: ctx.channels, template: 'generic', data: { heading: subject, body, bodyIsHtml } });
      const email = res.results.find((x) => x.channel === 'email');
      const sent = res.results.some((x) => x.status === 'sent');
      const allSkipped = res.results.every((x) => x.status === 'skipped');
      // A skipped send (provider unconfigured) is not retried forever: it is
      // marked sent-with-no-message-id so the campaign can complete.
      ok(
        await db.from('comms_recipients').update({
          status: sent || allSkipped ? 'sent' : 'error',
          message_id: email?.status === 'sent' && email.detail !== 'sent' ? email.detail : null,
          sent_at: new Date().toISOString(),
        }).eq('id', r.id),
        'campaign.recipient',
      );
      if (Date.now() - startedAt >= budgetMs) break;
    }
  }

  const { count } = await db.from('comms_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'queued');
  const remaining = count ?? 0;
  if (remaining === 0) {
    ok(await db.from('comms_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), sent_by: actorClerkId }).eq('id', campaignId).eq('status', 'sending'), 'campaign.sent');
    await audit({ actorId: actorClerkId, action: 'comms.campaign-sent', target: `campaign:${campaignId}` });
  }
  return remaining;
}

/** Cron: start any scheduled campaign whose time has arrived. */
export async function processDueCampaigns(actorClerkId = 'system:cron'): Promise<number[]> {
  const db = supabaseAdmin();
  const { data: due } = await db.from('comms_campaigns').select('id').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString());
  const started: number[] = [];
  for (const c of due ?? []) { await sendCampaign(c.id, actorClerkId); started.push(c.id); }
  return started;
}

/** Cron: keep draining campaigns still marked `sending` (large blasts, or a timed-out send). */
export async function drainSendingCampaigns(actorClerkId = 'system:cron', budgetMs = 240_000): Promise<Record<number, number>> {
  const db = supabaseAdmin();
  const { data: sending } = await db.from('comms_campaigns').select('id').eq('status', 'sending').order('id');
  const out: Record<number, number> = {};
  const startedAt = Date.now();
  for (const c of sending ?? []) {
    const left = budgetMs - (Date.now() - startedAt);
    if (left <= 0) break;
    out[c.id] = await drainCampaign(c.id, actorClerkId, left);
  }
  return out;
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
