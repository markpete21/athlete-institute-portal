import 'server-only';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Team-balance explainer (Module 18B). After the Module 6 auto-balancing draft,
 * Claude (claude-sonnet-4-6) turns the draft's balance attributes into plain-
 * language TALKING POINTS for staff. STRICTLY ADMIN-PRIVATE - never shown to
 * families (surfacing algorithmic reasoning invites litigating every placement).
 */

export interface ExplainResult { explanation: string; source: 'claude' | 'fallback' }

export async function explainDraft(divisionId: number, actorClerkId: string): Promise<ExplainResult> {
  const db = supabaseAdmin();

  // Gather team compositions + the draft's recorded spread (anonymous aggregates).
  const { data: teams } = await db.from('teams').select('id, name').eq('division_id', divisionId).order('id');
  const compositions: Array<{ team: string; size: number; locked: number; groups: number }> = [];
  for (const t of teams ?? []) {
    const { data: members } = await db.from('team_members').select('locked, group_key').eq('team_id', t.id);
    const rows = members ?? [];
    compositions.push({
      team: t.name,
      size: rows.length,
      locked: rows.filter((m) => m.locked).length,
      groups: new Set(rows.map((m) => m.group_key).filter(Boolean)).size,
    });
  }
  // The draft audit trail carries the attribute spread it achieved.
  const { data: draftAudit } = await db.from('audit_log').select('meta').eq('action', 'division.drafted').eq('target', `division:${divisionId}`).order('id', { ascending: false }).limit(1).maybeSingle();
  const spread = (draftAudit?.meta as { spread?: Record<string, number> } | null)?.spread ?? null;

  const fallback = [
    `Teams were built by the balancing draft to equalize the configured attributes across ${compositions.length} teams.`,
    ...compositions.map((c) => `${c.team}: ${c.size} players${c.locked ? ` (${c.locked} pinned)` : ''}${c.groups ? `, ${c.groups} friend group${c.groups > 1 ? 's' : ''} kept together` : ''}.`),
    spread ? `Final attribute spread across teams: ${Object.entries(spread).map(([k, v]) => `${k} ${v}`).join(', ')} (lower = more even).` : '',
    'Placements optimize for even, competitive teams - locked players and friend groups were honored first, then the draft balanced the remaining pool.',
  ].filter(Boolean).join(' ');

  let explanation = fallback;
  let source: 'claude' | 'fallback' = 'fallback';
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && compositions.length) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 600,
          system: 'You write ADMIN-ONLY talking points for sports staff explaining why an auto-balancing draft distributed players the way it did. Plain language, confident, 3-5 bullet points. Aggregate reasoning only - never name or single out a player. This is never shown to families.',
          messages: [{ role: 'user', content: JSON.stringify({ compositions, attributeSpread: spread }) }],
        }),
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        explanation = (json.content ?? []).map((c: { text?: string }) => c.text ?? '').join('') || fallback;
        source = 'claude';
      }
    } catch { /* fallback stands */ }
  }

  // ADMIN-PRIVATE table; no play-side surface reads it.
  await db.from('team_balance_explainers').insert({ division_id: divisionId, explanation, model: source === 'claude' ? 'claude-sonnet-4-6' : null });
  await audit({ actorId: actorClerkId, action: 'team-explainer.generated', target: `division:${divisionId}`, meta: { source } });
  return { explanation, source };
}

/** Latest explanation for a division (staff views only). */
export async function latestExplanation(divisionId: number): Promise<string | null> {
  const { data } = await supabaseAdmin().from('team_balance_explainers').select('explanation').eq('division_id', divisionId).order('id', { ascending: false }).limit(1).maybeSingle();
  return data?.explanation ?? null;
}
