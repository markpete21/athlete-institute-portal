import 'server-only';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { TOOLS_BY_SURFACE, type AssistContext, type Surface } from '@/lib/assist/tools';

/**
 * Assist shared core (Module 21): ONE grounded-retrieval loop, three scoped
 * surfaces. Answers come only from tool calls against live data - if retrieval
 * returns nothing, Assist says so and hands off to a human (text/call/email);
 * it never guesses. Read-only across all surfaces (the tool framework is
 * action-ready behind future permission + confirmation). Rate-limited per
 * caller because every question is an API call and the public surface is
 * internet-facing.
 *
 * Model: claude-sonnet-5 (the spec pinned claude-sonnet-4-6, which predates it;
 * per project decision the newest Sonnet is used for M21/22).
 */

export const ASSIST_MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 5;

export interface HandoffOptions { phone: string; sms: string; email: string }

async function assistConfig(): Promise<HandoffOptions & { publicRate: number; authedRate: number }> {
  const { data } = await supabaseAdmin().from('assist_config').select('*').eq('id', 1).maybeSingle();
  return {
    phone: data?.handoff_phone ?? '519-941-0492',
    sms: data?.handoff_sms ?? '519-941-0492',
    email: data?.handoff_email ?? 'info@athleteinstitute.ca',
    publicRate: data?.public_rate_per_hour ?? 20,
    authedRate: data?.authed_rate_per_hour ?? 60,
  };
}

export function handoffMessage(h: HandoffOptions): string {
  return `I want to make sure you get the right answer, so let me hand you to a real person: text or call us at ${h.phone}, or email ${h.email}. We're quick to respond!`;
}

function systemPrompt(surface: Surface, h: HandoffOptions): string {
  const shared = [
    `You are Assist, the Athlete Institute helper. Voice: warm, community-first ("Play. Compete. Grow."), encouraging, plain language. Never corporate or salesy.`,
    `GROUNDING (non-negotiable): answer ONLY from tool results. NEVER invent or estimate a program, price, date, age range, or policy. If the tools return nothing relevant, say you don't have that information and offer the human handoff: text/call ${h.phone} or email ${h.email}.`,
    `If a question is ambiguous, ask ONE clarifying question first, then answer from tools.`,
    `If the question is off-topic for Athlete Institute programs and facilities, politely decline and steer back.`,
    `You are READ-ONLY: you cannot register, pay, change, or cancel anything. To act, point them at the right page or the human handoff.`,
  ];
  const perSurface: Record<Surface, string> = {
    public: 'Surface: PUBLIC. You may only discuss the public catalog (programs, prices, ages, dates, locations, policies). You have NO access to any personal or account data - never claim otherwise. Encourage registration with the registerUrl links the tools return.',
    customer: "Surface: CUSTOMER CONCIERGE. You may additionally discuss the signed-in household's OWN registrations, schedule, balances, and points via the my_* tools. Never speculate about other families. If they need staff help, offer to hand off with their question attached.",
    admin: 'Surface: ADMIN COPILOT. Staff caller. You may answer org-wide read questions (unpaid balances, program stats, capacity) and use navigate to point them at the exact admin screen. Keep answers tight and operational.',
  };
  return [...shared, perSurface[surface]].join('\n');
}

// --- rate limiting (log-backed) ---------------------------------------------------

export async function checkRateLimit(surface: Surface, rateKey: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const cfg = await assistConfig();
  const limit = surface === 'public' ? cfg.publicRate : cfg.authedRate;
  const { count } = await supabaseAdmin()
    .from('assist_logs')
    .select('id', { count: 'exact', head: true })
    .eq('rate_key', rateKey)
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
  return { allowed: (count ?? 0) < limit, used: count ?? 0, limit };
}

// --- the loop ------------------------------------------------------------------------

export interface AssistMessage { role: 'user' | 'assistant'; content: string }
export interface AssistResult { reply: string; toolCalls: number; handedOff: boolean; navigate?: string | null }

type ModelContent = Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
export type CallModel = (params: { system: string; messages: unknown[]; tools: unknown[] }) => Promise<{ content: ModelContent; stop_reason: string }>;

/** Real Anthropic Messages call (injectable for tests). */
const callAnthropic: CallModel = async ({ system, messages, tools }) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ASSIST_MODEL, max_tokens: 1200, system, messages, tools }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  return res.json();
};

/**
 * Run one Assist turn: rate-limit, then loop model <-> tools until a final
 * text answer (max MAX_TOOL_ROUNDS). Tool errors and empty retrievals flow back
 * to the model, whose grounding rules turn them into an honest handoff.
 */
export async function runAssist(
  surface: Surface,
  rateKey: string,
  messages: AssistMessage[],
  ctx: AssistContext,
  opts: { callModel?: CallModel } = {},
): Promise<AssistResult> {
  const db = supabaseAdmin();
  const cfg = await assistConfig();

  const rate = await checkRateLimit(surface, rateKey);
  if (!rate.allowed) {
    return { reply: `You've hit the hourly question limit - give it a little while, or reach us directly: text/call ${cfg.phone} or email ${cfg.email}.`, toolCalls: 0, handedOff: true };
  }

  const tools = TOOLS_BY_SURFACE[surface];
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const call = opts.callModel ?? callAnthropic;

  const convo: unknown[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let toolCalls = 0;
  let navigateRoute: string | null = null;
  let reply = '';

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const res = await call({ system: systemPrompt(surface, cfg), messages: convo, tools: toolDefs });
      const toolUses = res.content.filter((c) => c.type === 'tool_use');
      const text = res.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');

      if (res.stop_reason !== 'tool_use' || toolUses.length === 0 || round === MAX_TOOL_ROUNDS) {
        reply = text || handoffMessage(cfg);
        break;
      }

      convo.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const tu of toolUses) {
        toolCalls += 1;
        const tool = tools.find((t) => t.name === tu.name);
        let output: unknown;
        try {
          output = tool ? await tool.run(tu.input ?? {}, ctx) : { error: 'unknown tool' };
        } catch (err) {
          output = { error: err instanceof Error ? err.message : 'tool failed' };
        }
        if (tu.name === 'navigate' && output && typeof output === 'object' && 'route' in output) navigateRoute = (output as { route: string | null }).route;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(output).slice(0, 8000) });
      }
      convo.push({ role: 'user', content: results });
    }
  } catch {
    reply = `Assist is having trouble right now. ${handoffMessage(cfg)}`;
  }

  const handedOff = reply.includes(cfg.phone) || reply.includes(cfg.email);
  const lastUser = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  await db.from('assist_logs').insert({ surface, rate_key: rateKey, question: lastUser.slice(0, 500), answered: !!reply, handed_off: handedOff, tool_calls: toolCalls });
  return { reply, toolCalls, handedOff, navigate: navigateRoute };
}
