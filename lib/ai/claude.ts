import 'server-only';

/**
 * Shared thin Claude caller for Module 22 ambient features (claude-sonnet-5;
 * the spec's sonnet-4-6 predates it). Every caller supplies a deterministic
 * fallback so features degrade gracefully without ANTHROPIC_API_KEY - AI
 * narrates/proposes, it never gates functionality.
 */

export const AI_MODEL = 'claude-sonnet-5';

export async function claudeText(system: string, user: string, maxTokens = 800): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
    return text || null;
  } catch {
    return null;
  }
}
