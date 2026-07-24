'use server';

import { revalidatePath } from 'next/cache';
import type { EmailBlock } from '@ai/foundation';
import type { NotifyChannel } from '@ai/foundation/notify';
import { getPortalSession } from '@/lib/auth';
import { cancelScheduled, createCampaign, scheduleCampaign, sendCampaign } from '@/lib/comms/campaigns';
import { draftEmail } from '@/lib/comms/draft';
import { updateTrigger } from '@/lib/comms/notifications';
import type { SegmentDefinition } from '@/lib/comms/segments';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

/** Build a simple campaign from subject + body text (one text block) + a program-id audience. */
export async function createCampaignAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const programIds = String(formData.get('programIds') ?? '').split(',').map((x) => Number(x.trim())).filter(Boolean);
  const audience: SegmentDefinition | null = programIds.length ? { include: [{ programIds }] } : null;
  const blocks: EmailBlock[] = [{ type: 'text', text: String(formData.get('body') ?? '') }];
  await createCampaign({
    name: String(formData.get('name') ?? 'Campaign'),
    brandKey: String(formData.get('brandKey') ?? '') || null,
    subject: String(formData.get('subject') ?? ''),
    blocks,
    audience,
    isMarketing: formData.get('isMarketing') !== 'off',
  }, s.userId!);
  revalidatePath('/comms');
}

/** Claude-draft: generate on-brand blocks, save as a new draft campaign. */
export async function draftCampaignAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const brandKey = String(formData.get('brandKey') ?? '') || null;
  const draft = await draftEmail(String(formData.get('prompt') ?? ''), brandKey);
  await createCampaign({ name: `Draft: ${draft.subject}`.slice(0, 60), brandKey, subject: draft.subject, blocks: draft.blocks, isMarketing: true }, s.userId!);
  revalidatePath('/comms');
}

export async function scheduleAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await scheduleCampaign(Number(formData.get('campaignId')), new Date(String(formData.get('when'))).toISOString(), s.userId!);
  revalidatePath(`/comms/${formData.get('campaignId')}`);
}

export async function cancelScheduleAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await cancelScheduled(Number(formData.get('campaignId')), s.userId!);
  revalidatePath(`/comms/${formData.get('campaignId')}`);
}

export async function sendAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await sendCampaign(Number(formData.get('campaignId')), s.userId!);
  revalidatePath(`/comms/${formData.get('campaignId')}`);
}

/** Announcement tool: quick multi-channel blast. */
export async function announceAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const channels = (['email', 'sms', 'push'] as NotifyChannel[]).filter((c) => formData.get(`ch_${c}`) === 'on');
  const programIds = String(formData.get('programIds') ?? '').split(',').map((x) => Number(x.trim())).filter(Boolean);
  const text = String(formData.get('message') ?? '');
  const id = await createCampaign({
    name: `Announcement ${text.slice(0, 30)}`, kind: 'announcement', subject: text.slice(0, 60), bodyText: text,
    channels: channels.length ? channels : ['email', 'sms', 'push'],
    audience: programIds.length ? { include: [{ programIds }] } : { include: [] },
    isMarketing: false,
  }, s.userId!);
  if (formData.get('when')) await scheduleCampaign(id, new Date(String(formData.get('when'))).toISOString(), s.userId!);
  else await sendCampaign(id, s.userId!);
  revalidatePath('/comms');
}

export async function updateTriggerAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const channels = (['email', 'sms', 'push'] as NotifyChannel[]).filter((c) => formData.get(`ch_${c}`) === 'on');
  await updateTrigger(String(formData.get('triggerKey')), {
    enabled: formData.get('enabled') === 'on',
    channels,
    subject: String(formData.get('subject') ?? ''),
    body_template: String(formData.get('body') ?? ''),
  }, s.userId!);
  revalidatePath('/comms/notifications');
}
