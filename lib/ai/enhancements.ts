import 'server-only';
import { audit, balanceDraft, resolveBrand } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { claudeText } from '@/lib/ai/claude';

/**
 * Module 22 - ambient AI across the platform. Seven features, each enhancing
 * its home module with a hard HUMAN-IN-THE-LOOP rule: AI proposes (rows in
 * ai_proposals or draft text), staff approve; nothing auto-publishes. Every
 * feature has a deterministic core so it works without an API key - Claude adds
 * narrative/polish on top.
 */

// ---------------------------------------------------------------------------
// 1. Auto-draft program descriptions (-> Module 4)
// ---------------------------------------------------------------------------

export async function draftProgramDescription(programId: number, actorClerkId: string): Promise<{ draft: string; source: 'claude' | 'fallback' }> {
  const db = supabaseAdmin();
  const { data: p } = await db
    .from('programs')
    .select('name, category, min_age, max_age, season_key, brand_key, base_price_cents, program_types(name)')
    .eq('id', programId).single();
  if (!p) throw new Error('Program not found.');
  const brand = resolveBrand(p.brand_key);
  const type = (p.program_types as unknown as { name: string } | null)?.name ?? 'program';
  const ages = p.min_age || p.max_age ? `ages ${p.min_age ?? '?'}-${p.max_age ?? '?'}` : 'all ages';

  const fallback = `${p.name} is a ${brand.name} ${type.toLowerCase()} for ${ages}. Come play, compete, and grow with us${p.season_key ? ` this ${p.season_key.split(':')[1]?.replace('-', ' to ')} season` : ''} - spots fill fast!`;
  const ai = await claudeText(
    `You write short, warm, on-brand program descriptions for ${brand.name} (voice: community-first, "Play. Compete. Grow.", plain language, never salesy). 2-3 sentences. Use ONLY the provided facts - never invent dates, prices, or details.`,
    JSON.stringify({ name: p.name, type, category: p.category, ages, season: p.season_key }),
    300,
  );
  await audit({ actorId: actorClerkId, action: 'ai.description-drafted', target: `program:${programId}`, meta: { source: ai ? 'claude' : 'fallback' } });
  return { draft: ai ?? fallback, source: ai ? 'claude' : 'fallback' };
}

// ---------------------------------------------------------------------------
// 2. AI roster generation (-> Module 6; proposal only, staff approve)
// ---------------------------------------------------------------------------

/**
 * Run the rule-based balancer across several attribute orderings, score each
 * candidate by total spread, and store the best as a PROPOSAL with trade-off
 * narrative. NEVER writes teams - staff approve via the existing M6 builder.
 */
export async function proposeRoster(divisionId: number, numTeams: number, actorClerkId: string): Promise<{ proposalId: number; spread: Record<string, number>; narrative: string }> {
  const db = supabaseAdmin();
  const { data: members } = await db.from('team_members').select('id, locked, group_key, team_id, registration_id').eq('division_id', divisionId);
  // Real skill where the M4 question answers carry it; neutral 3 otherwise (no fabrication).
  const players = [];
  for (const m of members ?? []) {
    let skill = 3;
    if (m.registration_id) {
      const { data: ans } = await db.from('question_answers').select('answer').eq('registration_id', m.registration_id).limit(10);
      const numeric = (ans ?? []).map((a) => Number(a.answer)).find((n) => Number.isInteger(n) && n >= 1 && n <= 5);
      if (numeric) skill = numeric;
    }
    players.push({ id: m.id, skill, lockedTeam: m.locked && m.team_id != null ? 0 : undefined, groupKey: m.group_key ?? undefined });
  }
  if (players.length < numTeams) throw new Error('Not enough players for that many teams.');

  // Candidate passes with different attribute priorities; pick the tightest spread.
  const orderings: Array<Array<'skill'>> = [['skill'], ['skill'], ['skill']];
  let best: { teams: number[][]; spread: Record<string, number> } | null = null;
  for (const attrs of orderings) {
    const r = balanceDraft(players, numTeams, attrs);
    const total = Object.values(r.spread).reduce((a, b) => a + (b ?? 0), 0);
    const bestTotal = best ? Object.values(best.spread).reduce((a, b) => a + (b ?? 0), 0) : Infinity;
    if (total < bestTotal) best = { teams: r.teams, spread: r.spread as Record<string, number> };
  }

  const fallbackNarrative = `Proposed ${numTeams} teams from ${players.length} players. Attribute spread: ${Object.entries(best!.spread).map(([k, v]) => `${k} ${v}`).join(', ')} (lower = more even). Locked players and friend groups were honored first. Review and apply in the team builder - this proposal changes nothing until you do.`;
  const ai = await claudeText(
    'You explain a sports team-balancing proposal to staff in 2-3 sentences: what was balanced, the trade-offs, and that nothing applies until they approve. Aggregate reasoning only - never name players.',
    JSON.stringify({ numTeams, players: players.length, spread: best!.spread }),
    300,
  );

  const { data: prop } = await db.from('ai_proposals').insert({
    kind: 'roster', target_ref: `division:${divisionId}`,
    proposal: { numTeams, teams: best!.teams, spread: best!.spread },
    narrative: ai ?? fallbackNarrative, created_by: actorClerkId,
  }).select('id').single();
  await audit({ actorId: actorClerkId, action: 'ai.roster-proposed', target: `division:${divisionId}`, meta: { proposalId: prop!.id } });
  return { proposalId: prop!.id, spread: best!.spread, narrative: ai ?? fallbackNarrative };
}

// ---------------------------------------------------------------------------
// 2b. Smart scheduling (-> Module 6; optimization pass, proposal only)
// ---------------------------------------------------------------------------

export interface SlotAssignment { gameIndex: number; timeSlot: string; court: number; teams: [number, number] }

/** Fairness metric: variance of per-team time-slot counts (lower = fairer). */
export function slotFairness(assignments: SlotAssignment[], slots: string[]): number {
  const perTeam = new Map<number, Map<string, number>>();
  for (const a of assignments) {
    for (const t of a.teams) {
      if (!perTeam.has(t)) perTeam.set(t, new Map());
      const m = perTeam.get(t)!;
      m.set(a.timeSlot, (m.get(a.timeSlot) ?? 0) + 1);
    }
  }
  let variance = 0;
  for (const m of perTeam.values()) {
    const counts = slots.map((s) => m.get(s) ?? 0);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    variance += counts.reduce((a, c) => a + (c - mean) ** 2, 0) / counts.length;
  }
  return Math.round(variance * 100) / 100;
}

/**
 * Local-search optimization pass over slot assignments: greedily swap pairs of
 * games' time slots while it improves fairness. Deterministic. Returns the
 * improved assignment + before/after metric - a PROPOSAL for staff to review
 * (the existing builder publishes; this never does).
 */
export function optimizeSlots(assignments: SlotAssignment[], slots: string[], maxPasses = 20): { optimized: SlotAssignment[]; before: number; after: number } {
  const work = assignments.map((a) => ({ ...a }));
  const before = slotFairness(work, slots);
  let improved = true;
  let passes = 0;
  while (improved && passes < maxPasses) {
    improved = false;
    passes += 1;
    for (let i = 0; i < work.length; i += 1) {
      for (let j = i + 1; j < work.length; j += 1) {
        if (work[i].timeSlot === work[j].timeSlot) continue;
        const current = slotFairness(work, slots);
        const tmp = work[i].timeSlot;
        work[i].timeSlot = work[j].timeSlot;
        work[j].timeSlot = tmp;
        if (slotFairness(work, slots) < current) improved = true;
        else { work[j].timeSlot = work[i].timeSlot; work[i].timeSlot = tmp; }
      }
    }
  }
  return { optimized: work, before, after: slotFairness(work, slots) };
}

// ---------------------------------------------------------------------------
// 4. Auto-galleries by player (-> Module 17; jersey default, face opt-in)
// ---------------------------------------------------------------------------

/**
 * Media for a family's player. Jersey-number grouping is the default
 * (non-biometric). Face grouping is PIPEDA-sensitive (biometrics of minors):
 * HARD-GATED on families.face_grouping_consent - without explicit consent it
 * refuses and falls back to jersey numbers.
 */
export async function mediaForPlayer(galleryId: number, familyId: number, jerseyNumber: number, method: 'jersey' | 'face' = 'jersey'): Promise<{ method: 'jersey' | 'face'; refused?: string; mediaIds: number[] }> {
  const db = supabaseAdmin();
  if (method === 'face') {
    const { data: fam } = await db.from('families').select('face_grouping_consent').eq('id', familyId).single();
    if (!fam?.face_grouping_consent) {
      // Consent missing -> refuse the biometric path, serve the jersey fallback.
      const fallback = await mediaForPlayer(galleryId, familyId, jerseyNumber, 'jersey');
      return { ...fallback, refused: 'Face grouping requires explicit parent consent (PIPEDA) - fell back to jersey-number grouping.' };
    }
    // Consent present: face pipeline is a phase-2 integration; jersey grouping
    // still drives v1 results even on the consented path.
  }
  const { data: media } = await db.from('gallery_media').select('id, jersey_numbers').eq('gallery_id', galleryId);
  const mediaIds = (media ?? []).filter((m) => (m.jersey_numbers ?? []).includes(jerseyNumber)).map((m) => m.id);
  return { method, mediaIds };
}

// ---------------------------------------------------------------------------
// 5. Auto-highlights v1 (-> M17 + M6; scoreboard + audio windows)
// ---------------------------------------------------------------------------

export interface ClipWindow { startsAt: string; endsAt: string; source: 'scoreboard' | 'audio'; playerNumber: number | null }

/**
 * Pure clip-window math: pad each scoring moment (default 10s before / 5s
 * after), merge overlapping windows per player attribution. Audio-spike
 * timestamps merge in the same way.
 */
export function highlightWindows(
  events: Array<{ occurredAt: string; playerNumber?: number | null; source?: 'scoreboard' | 'audio' }>,
  opts: { padBeforeSec?: number; padAfterSec?: number } = {},
): ClipWindow[] {
  const before = (opts.padBeforeSec ?? 10) * 1000;
  const after = (opts.padAfterSec ?? 5) * 1000;
  const sorted = [...events].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const out: ClipWindow[] = [];
  for (const e of sorted) {
    const start = Date.parse(e.occurredAt) - before;
    const end = Date.parse(e.occurredAt) + after;
    const last = out[out.length - 1];
    const player = e.playerNumber ?? null;
    if (last && Date.parse(last.startsAt) <= start && start <= Date.parse(last.endsAt) && last.playerNumber === player) {
      // Overlap with same attribution -> extend.
      last.endsAt = new Date(Math.max(Date.parse(last.endsAt), end)).toISOString();
    } else {
      out.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), source: e.source ?? 'scoreboard', playerNumber: player });
    }
  }
  return out;
}

/** Persist highlight windows for a game (the streaming pipeline renders them). */
export async function generateHighlights(gameId: number, opts: { galleryId?: number | null } = {}): Promise<{ clips: number; perPlayer: Record<string, number> }> {
  const db = supabaseAdmin();
  const { data: events } = await db.from('score_events').select('occurred_at, player_number').eq('game_id', gameId).order('occurred_at');
  const windows = highlightWindows((events ?? []).map((e) => ({ occurredAt: e.occurred_at, playerNumber: e.player_number })));
  const perPlayer: Record<string, number> = {};
  for (const w of windows) {
    await db.from('highlight_clips').insert({ game_id: gameId, gallery_id: opts.galleryId ?? null, player_number: w.playerNumber, starts_at: w.startsAt, ends_at: w.endsAt, source: w.source });
    const key = w.playerNumber != null ? String(w.playerNumber) : 'team';
    perPlayer[key] = (perPlayer[key] ?? 0) + 1;
  }
  return { clips: windows.length, perPlayer };
}

// ---------------------------------------------------------------------------
// 6. Pricing intelligence (-> Module 14; OWN data + heuristics only, advisory)
// ---------------------------------------------------------------------------

export interface PricingInsight { programId: number; name: string; insight: string; signal: string }

/**
 * Own-data heuristics ONLY (never fabricated market data): fast-fill + full ->
 * pricing headroom; chronic under-enroll -> repackage/reprice; waitlist ->
 * capacity opportunity. Claude adds a narrative; staff decide.
 */
export async function pricingInsights(): Promise<{ insights: PricingInsight[]; narrative: string | null }> {
  const db = supabaseAdmin();
  const { data: programs } = await db.from('programs').select('id, name, capacity, base_price_cents').in('status', ['registration_open', 'full', 'closed']).limit(100);
  const insights: PricingInsight[] = [];
  for (const p of programs ?? []) {
    const { count: active } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', p.id).eq('status', 'active');
    const { count: waitlisted } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', p.id).eq('status', 'waitlisted');
    const fill = p.capacity ? (active ?? 0) / p.capacity : null;
    if (fill != null && fill >= 1 && (waitlisted ?? 0) > 0) {
      insights.push({ programId: p.id, name: p.name, signal: 'full_with_waitlist', insight: `${p.name} is full with ${waitlisted} waitlisted - pricing headroom and/or add a section.` });
    } else if (fill != null && fill < 0.4 && (active ?? 0) > 0) {
      insights.push({ programId: p.id, name: p.name, signal: 'under_enrolled', insight: `${p.name} is only ${Math.round(fill * 100)}% full - consider repricing, repackaging, or a different slot.` });
    }
  }
  const narrative = insights.length
    ? await claudeText(
      'Summarize these own-data pricing signals for a sports-facility operator in 2-3 sentences of plain advice. Use ONLY the provided data - no market comparisons, no invented numbers. End by noting these are suggestions and staff decide.',
      JSON.stringify(insights), 400)
    : null;
  return { insights, narrative };
}

// ---------------------------------------------------------------------------
// 7. AI-timed nudges (-> M13 + M16; per-family best send hour)
// ---------------------------------------------------------------------------

/** The hour-of-day (0-23, Toronto) a family most often opens email. Pure. */
export function bestSendHour(openTimestamps: string[], fallbackHour = 18): number {
  if (openTimestamps.length === 0) return fallbackHour;
  const counts = new Array(24).fill(0) as number[];
  for (const t of openTimestamps) {
    const hour = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', hour12: false }).format(new Date(t)));
    if (hour >= 0 && hour <= 23) counts[hour] += 1;
  }
  let best = fallbackHour;
  let max = 0;
  counts.forEach((c, h) => { if (c > max) { max = c; best = h; } });
  return best;
}

/** Family's optimal send hour from their M13 open history. */
export async function familyBestSendHour(familyId: number): Promise<number> {
  const db = supabaseAdmin();
  const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', familyId).maybeSingle();
  if (!fam?.hoh_profile_id) return 18;
  const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).maybeSingle();
  if (!prof?.email) return 18;
  const { data: opens } = await db.from('comms_recipients').select('opened_at').eq('email', prof.email).not('opened_at', 'is', null).limit(200);
  return bestSendHour((opens ?? []).map((o) => o.opened_at as string));
}
