/**
 * notify() — the single send layer (Module 0 §6). Server-only: import from
 * '@ai/foundation/notify'.
 *
 * Three channels — email (Resend), SMS (Twilio), web push (VAPID) — behind one
 * API: notify({ to, channels, template, data, brandKey }). Every early
 * cross-module reminder (staff pay, booking keep-both, waitlist, payment/PAD,
 * cert-expiry) calls this BEFORE Module 13 exists; Module 13 builds campaign UX
 * on top, it does not replace this.
 *
 * Resilience: a channel whose keys or recipient are missing returns
 * `status:'skipped'` (never throws), and a send failure returns
 * `status:'error'` — so one dead channel never blocks the others or the caller.
 */

import { Resend } from 'resend';
import twilio from 'twilio';
import webpush, { type PushSubscription } from 'web-push';
import {
  renderNotification,
  type NotifyTemplates,
  type TemplateKey,
} from './notify-templates';

export type NotifyChannel = 'email' | 'sms' | 'push';

export interface NotifyRecipient {
  email?: string | null;
  phone?: string | null; // E.164, e.g. +15195551234
  pushSubscription?: PushSubscription | null;
}

export interface NotifyInput<K extends TemplateKey> {
  to: NotifyRecipient;
  channels: NotifyChannel[];
  template: K;
  data: NotifyTemplates[K];
  /** Sub-brand to theme by (default = Athlete Institute). */
  brandKey?: string | null;
}

export interface ChannelResult {
  channel: NotifyChannel;
  status: 'sent' | 'skipped' | 'error';
  detail: string;
}

export interface NotifyResult {
  results: ChannelResult[];
  /** True if every requested channel sent. */
  ok: boolean;
}

// --- lazy clients (constructed only when configured) ------------------------

let _resend: Resend | null = null;
function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

let _twilio: ReturnType<typeof twilio> | null = null;
function twilioClient(): { client: ReturnType<typeof twilio>; from: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return null;
  if (!_twilio) _twilio = twilio(sid, token);
  return { client: _twilio, from };
}

let _webpushReady = false;
function webpushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!_webpushReady) {
    webpush.setVapidDetails('mailto:support@athleteinstitute.ca', pub, priv);
    _webpushReady = true;
  }
  return true;
}

// --- channel senders --------------------------------------------------------

async function sendEmail(to: string, subject: string, html: string): Promise<ChannelResult> {
  const client = resendClient();
  if (!client) return { channel: 'email', status: 'skipped', detail: 'RESEND_API_KEY not set' };
  const from = process.env.RESEND_FROM || 'Athlete Institute <noreply@athleteinstitute.ca>';
  try {
    const { data, error } = await client.emails.send({ from, to, subject, html });
    if (error) return { channel: 'email', status: 'error', detail: error.message };
    return { channel: 'email', status: 'sent', detail: data?.id ?? 'sent' };
  } catch (err) {
    return { channel: 'email', status: 'error', detail: msg(err) };
  }
}

async function sendSms(to: string, body: string): Promise<ChannelResult> {
  const cfg = twilioClient();
  if (!cfg) return { channel: 'sms', status: 'skipped', detail: 'Twilio env not set' };
  try {
    const m = await cfg.client.messages.create({ to, from: cfg.from, body });
    return { channel: 'sms', status: 'sent', detail: m.sid };
  } catch (err) {
    return { channel: 'sms', status: 'error', detail: msg(err) };
  }
}

async function sendPush(
  sub: PushSubscription,
  payload: { title: string; body: string; url?: string },
): Promise<ChannelResult> {
  if (!webpushConfigured()) return { channel: 'push', status: 'skipped', detail: 'VAPID keys not set' };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return { channel: 'push', status: 'sent', detail: 'sent' };
  } catch (err) {
    return { channel: 'push', status: 'error', detail: msg(err) };
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Send a templated notification across the requested channels. Renders once
 * (brand-themed) and dispatches concurrently; returns per-channel results.
 */
export async function notify<K extends TemplateKey>(input: NotifyInput<K>): Promise<NotifyResult> {
  const r = renderNotification(input.template, input.data, input.brandKey);
  const jobs: Array<Promise<ChannelResult>> = [];

  for (const channel of input.channels) {
    if (channel === 'email') {
      if (input.to.email) jobs.push(sendEmail(input.to.email, r.subject, r.html));
      else jobs.push(Promise.resolve({ channel, status: 'skipped', detail: 'no email address' }));
    } else if (channel === 'sms') {
      if (input.to.phone) jobs.push(sendSms(input.to.phone, r.text));
      else jobs.push(Promise.resolve({ channel, status: 'skipped', detail: 'no phone number' }));
    } else if (channel === 'push') {
      if (input.to.pushSubscription)
        jobs.push(sendPush(input.to.pushSubscription, { title: r.pushTitle, body: r.text, url: (input.data as { ctaUrl?: string }).ctaUrl }));
      else jobs.push(Promise.resolve({ channel, status: 'skipped', detail: 'no push subscription' }));
    }
  }

  const results = await Promise.all(jobs);
  return { results, ok: results.every((x) => x.status === 'sent') };
}
