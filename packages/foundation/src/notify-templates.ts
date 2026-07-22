/**
 * Notification templates (Module 0 §6) — PURE + edge-safe, so they're unit
 * testable and render identically wherever called. The server-only send layer
 * (@ai/foundation/notify) renders these and dispatches to Resend/Twilio/push.
 *
 * Each template produces all three surfaces from one data object:
 *   - email: brand-themed HTML (inline styles — email clients ignore <style>
 *     and rarely load web fonts, so we use the Helvetica/Arial fallback of the
 *     Vanguard stack and the brand accent hex directly)
 *   - text:  plain body for SMS + push
 *   - subject / pushTitle: short lines
 *
 * Module 13 (Communications) builds the campaign UX on top of this; it does not
 * replace these transactional templates.
 */

import { resolveBrand, type Brand } from './brands';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Brand-themed email shell (Vanguard, email-client-safe). */
export function renderEmailShell(
  brand: Brand,
  parts: { heading: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string },
): string {
  const accent = brand.accent;
  const cta =
    parts.ctaLabel && parts.ctaUrl
      ? `<a href="${parts.ctaUrl}" style="display:inline-block;background:${accent};color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;font-size:13px;padding:12px 22px;border-radius:9999px;text-decoration:none">${escapeHtml(parts.ctaLabel)}</a>`
      : '';
  return `
  <div style="background:#faf9f7;color:#333;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;padding:32px">
    <div style="max-width:540px;margin:0 auto;border:1px solid rgba(30,30,30,0.14);background:#fff">
      <div style="padding:20px 28px;border-bottom:1px solid rgba(30,30,30,0.14)">
        <span style="font-weight:800;letter-spacing:-0.02em;font-size:15px;color:#1e1e1e">${escapeHtml(brand.name)}</span><span style="color:${accent};font-weight:800">.</span>
      </div>
      <div style="padding:28px">
        <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.03em;margin:0 0 12px;color:#1e1e1e">${escapeHtml(parts.heading)}</h1>
        <div style="color:#555;font-size:15px;line-height:1.5;margin:0 0 22px">${parts.bodyHtml}</div>
        ${cta}
      </div>
      <div style="padding:16px 28px;border-top:1px solid rgba(30,30,30,0.14);color:#9ea1a1;font-size:12px">
        ${escapeHtml(brand.name)} • athleteinstitute.ca
      </div>
    </div>
  </div>`;
}

/** Typed data per template key — later modules add entries here. */
export interface NotifyTemplates {
  generic: { heading: string; body: string; ctaLabel?: string; ctaUrl?: string };
  'payment.reminder': { amountLabel: string; dueLabel: string; payUrl: string };
  'waitlist.opening': { programName: string; claimUrl: string; expiresLabel: string };
}

export type TemplateKey = keyof NotifyTemplates;

export interface RenderedNotification {
  subject: string;
  html: string;
  text: string;
  pushTitle: string;
}

interface TemplateDef<K extends TemplateKey> {
  subject: (d: NotifyTemplates[K]) => string;
  pushTitle: (d: NotifyTemplates[K]) => string;
  text: (d: NotifyTemplates[K]) => string;
  emailBody: (d: NotifyTemplates[K]) => { heading: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string };
}

const TEMPLATES: { [K in TemplateKey]: TemplateDef<K> } = {
  generic: {
    subject: (d) => d.heading,
    pushTitle: (d) => d.heading,
    text: (d) => `${d.heading}\n\n${d.body}${d.ctaUrl ? `\n\n${d.ctaUrl}` : ''}`,
    emailBody: (d) => ({
      heading: d.heading,
      bodyHtml: escapeHtml(d.body).replace(/\n/g, '<br>'),
      ctaLabel: d.ctaLabel,
      ctaUrl: d.ctaUrl,
    }),
  },
  'payment.reminder': {
    subject: (d) => `Payment reminder — ${d.amountLabel} due ${d.dueLabel}`,
    pushTitle: () => 'Payment reminder',
    text: (d) => `A payment of ${d.amountLabel} is due ${d.dueLabel}. Pay: ${d.payUrl}`,
    emailBody: (d) => ({
      heading: 'Payment reminder',
      bodyHtml: `A payment of <strong>${escapeHtml(d.amountLabel)}</strong> is due <strong>${escapeHtml(d.dueLabel)}</strong>.`,
      ctaLabel: 'Pay now',
      ctaUrl: d.payUrl,
    }),
  },
  'waitlist.opening': {
    subject: (d) => `A spot opened in ${d.programName}`,
    pushTitle: () => 'A spot opened up',
    text: (d) =>
      `A spot opened in ${d.programName}. Claim it by ${d.expiresLabel}: ${d.claimUrl}`,
    emailBody: (d) => ({
      heading: 'A spot just opened up',
      bodyHtml: `A spot opened in <strong>${escapeHtml(d.programName)}</strong>. Claim it before <strong>${escapeHtml(d.expiresLabel)}</strong> — spots are offered first-come.`,
      ctaLabel: 'Claim your spot',
      ctaUrl: d.claimUrl,
    }),
  },
};

/** Render a template for a brand into all surfaces. */
export function renderNotification<K extends TemplateKey>(
  template: K,
  data: NotifyTemplates[K],
  brandKey?: string | null,
): RenderedNotification {
  const brand = resolveBrand(brandKey);
  const def = TEMPLATES[template];
  return {
    subject: def.subject(data),
    pushTitle: def.pushTitle(data),
    text: def.text(data),
    html: renderEmailShell(brand, def.emailBody(data)),
  };
}
