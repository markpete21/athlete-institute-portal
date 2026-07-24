import 'server-only';
import { resolveBrand, type EmailBlock } from '@ai/foundation';

/**
 * Claude-drafting (Module 13 Stage 2). Staff describe the email; Claude returns
 * an on-brand block array that loads into the builder canvas as editable blocks.
 * Uses the Anthropic Messages API directly (no SDK dep) with model
 * claude-sonnet-4-6 per the module spec; brand tokens are injected into the
 * system prompt so output matches the selected brand. Degrades gracefully when
 * ANTHROPIC_API_KEY is not configured.
 */

const MODEL = 'claude-sonnet-4-6';

export interface DraftResult { subject: string; blocks: EmailBlock[]; source: 'claude' | 'fallback'; note?: string }

export async function draftEmail(prompt: string, brandKey?: string | null): Promise<DraftResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  const brand = resolveBrand(brandKey ?? undefined);
  const fallback: DraftResult = {
    subject: prompt.slice(0, 60),
    blocks: [
      { type: 'header', title: brand.name },
      { type: 'text', text: `Draft for: ${prompt}` },
      { type: 'button', label: 'Learn more', url: '{{cta_url}}' },
    ],
    source: 'fallback',
    note: key ? undefined : 'ANTHROPIC_API_KEY not set — returned a placeholder draft.',
  };
  if (!key) return fallback;

  const system = [
    `You are an email copywriter for ${brand.name}. Write concise, warm, on-brand marketing/announcement email copy.`,
    `Brand accent color: ${brand.accent}. Keep it professional and mobile-friendly.`,
    `Return ONLY valid JSON: {"subject": string, "blocks": EmailBlock[]}.`,
    `EmailBlock is one of: {"type":"header","title":string}, {"type":"text","text":string}, {"type":"button","label":string,"url":string}, {"type":"divider"}, {"type":"footer","html":string}.`,
    `Use merge tags like {{first_name}} and {{program_name}} where natural. Include an unsubscribe + mailing-address footer block (CASL).`,
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: 'user', content: prompt }] }),
      cache: 'no-store',
    });
    if (!res.ok) return { ...fallback, note: `Anthropic API error ${res.status}.` };
    const json = await res.json();
    const text: string = (json.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!Array.isArray(parsed.blocks)) throw new Error('no blocks');
    return { subject: String(parsed.subject ?? prompt.slice(0, 60)), blocks: parsed.blocks as EmailBlock[], source: 'claude' };
  } catch (err) {
    return { ...fallback, note: `Could not parse Claude output (${err instanceof Error ? err.message : 'unknown'}) — returned a placeholder.` };
  }
}
