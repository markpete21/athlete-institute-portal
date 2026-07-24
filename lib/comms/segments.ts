import 'server-only';
import { ageAt, combineAudience, engagementFilter, torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Recipient segmentation (Module 13 Stage 3). A saved list stores a DEFINITION,
 * never a snapshot - resolveAudience() recomputes the recipient set LIVE at send
 * time so anyone who qualifies up to send-time is included. Supports
 * hierarchical include/exclude rules (brand -> sport -> type -> season ->
 * division / explicit programs), participant filters, an engagement filter, and
 * automatic hard-bounce/unsubscribe suppression.
 */

export interface SegmentRule {
  programIds?: number[];
  programTypeKeys?: string[];  // 'league' | 'camp' | ...
  brandKey?: string;
  seasonKey?: string;
  divisionId?: number;
}

export interface SegmentFilters {
  category?: string;                 // Academy | Club | Camps | Youth Sports | Adult
  standing?: 'returning' | 'new';    // returning-athlete vs brand-new
  ageMin?: number;
  ageMax?: number;
}

export interface SegmentDefinition {
  include: SegmentRule[];
  exclude?: SegmentRule[];
  filters?: SegmentFilters;
  engagementMonths?: number | null;  // exclude recipients with no open in N months
}

export interface Recipient {
  email: string;
  profileId: number | null;
  firstName: string | null;
  familyId: number | null;
}

/** Program ids that match a single rule (explicit ids win; else by type/brand/season/division). */
async function programIdsForRule(rule: SegmentRule): Promise<number[]> {
  if (rule.programIds?.length) return rule.programIds;
  const db = supabaseAdmin();
  let q = db.from('programs').select('id, program_types!inner(key)');
  if (rule.programTypeKeys?.length) q = q.in('program_types.key', rule.programTypeKeys);
  if (rule.brandKey) q = q.eq('brand_key', rule.brandKey);
  if (rule.seasonKey) q = q.eq('season_key', rule.seasonKey);
  const { data } = await q;
  let ids = (data ?? []).map((p) => p.id);
  if (rule.divisionId) {
    const { data: div } = await db.from('divisions').select('program_id').eq('id', rule.divisionId).maybeSingle();
    ids = div ? ids.filter((id) => id === div.program_id) : [];
  }
  return ids;
}

/** Recipients (by rule) as a map keyed by email, honoring participant filters. */
async function recipientsForRule(rule: SegmentRule, filters?: SegmentFilters): Promise<Map<string, Recipient>> {
  const db = supabaseAdmin();
  const programIds = await programIdsForRule(rule);
  const out = new Map<string, Recipient>();
  if (programIds.length === 0) return out;

  const { data: regs } = await db
    .from('registrations')
    .select('family_id, standing, family_members(first_name, dob), programs(category)')
    .in('program_id', programIds)
    .eq('status', 'active');

  const today = torontoToday();
  for (const r of regs ?? []) {
    const member = r.family_members as unknown as { first_name: string; dob: string | null } | null;
    const program = r.programs as unknown as { category: string | null } | null;
    if (filters?.category && program?.category !== filters.category) continue;
    if (filters?.standing === 'returning' && r.standing === 'brand_new') continue;
    if (filters?.standing === 'new' && r.standing !== 'brand_new') continue;
    if ((filters?.ageMin != null || filters?.ageMax != null)) {
      if (!member?.dob) continue;
      const age = ageAt(member.dob, today);
      if (filters.ageMin != null && age < filters.ageMin) continue;
      if (filters.ageMax != null && age > filters.ageMax) continue;
    }
    if (!r.family_id) continue;

    // Resolve the household contact email (HoH profile).
    const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', r.family_id).maybeSingle();
    if (!fam?.hoh_profile_id) continue;
    const { data: prof } = await db.from('profiles').select('id, email').eq('id', fam.hoh_profile_id).maybeSingle();
    if (!prof?.email) continue;
    if (!out.has(prof.email)) out.set(prof.email, { email: prof.email, profileId: prof.id, firstName: member?.first_name ?? null, familyId: r.family_id });
  }
  return out;
}

/** Currently suppressed emails (hard bounce / unsubscribe / complaint). */
async function suppressedEmails(): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from('comms_suppressions').select('email');
  return new Set((data ?? []).map((r) => r.email));
}

/**
 * Resolve a segment definition to its LIVE recipient list: union of include
 * rules, minus exclude rules, minus suppressions, then the optional engagement
 * filter. Deterministic order by first appearance.
 */
export async function resolveAudience(def: SegmentDefinition): Promise<Recipient[]> {
  const byEmail = new Map<string, Recipient>();
  const includeSets: string[][] = [];
  for (const rule of def.include) {
    const m = await recipientsForRule(rule, def.filters);
    for (const [email, rec] of m) if (!byEmail.has(email)) byEmail.set(email, rec);
    includeSets.push([...m.keys()]);
  }
  const excludeSets: string[][] = [];
  for (const rule of def.exclude ?? []) excludeSets.push([...(await recipientsForRule(rule)).keys()]);

  const suppressed = await suppressedEmails();
  let emails = combineAudience({ include: includeSets, exclude: excludeSets, suppressed }) as string[];

  if (def.engagementMonths) {
    const cutoff = monthsAgoISO(def.engagementMonths);
    const { lastOpenById, lastSentById } = await engagementHistory(emails);
    emails = engagementFilter({ ids: emails, lastOpenById, lastSentById, cutoffISO: cutoff }) as string[];
  }

  return emails.map((e) => byEmail.get(e)!).filter(Boolean);
}

/** Last-open + last-sent ISO per email across all past campaigns. */
async function engagementHistory(emails: string[]): Promise<{ lastOpenById: Map<string, string>; lastSentById: Map<string, string> }> {
  const lastOpenById = new Map<string, string>();
  const lastSentById = new Map<string, string>();
  if (emails.length === 0) return { lastOpenById, lastSentById };
  const { data } = await supabaseAdmin().from('comms_recipients').select('email, opened_at, created_at').in('email', emails);
  for (const r of data ?? []) {
    if (r.created_at && (!lastSentById.has(r.email) || r.created_at > lastSentById.get(r.email)!)) lastSentById.set(r.email, r.created_at);
    if (r.opened_at && (!lastOpenById.has(r.email) || r.opened_at > lastOpenById.get(r.email)!)) lastOpenById.set(r.email, r.opened_at);
  }
  return { lastOpenById, lastSentById };
}

function monthsAgoISO(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}
