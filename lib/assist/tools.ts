import 'server-only';
import { formatCAD } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Assist grounded-retrieval tools (Module 21). Every answer comes from these
 * READ-ONLY tools against live data - never from training or invention. Each
 * surface gets a scoped registry:
 *   public   -> catalog only (no personal data, ever)
 *   customer -> the caller's OWN household only
 *   admin    -> org-wide reads (M5 permissions refine later)
 * The framework is action-ready (a tool can later declare requiresConfirmation)
 * but every tool here is a read.
 */

export type Surface = 'public' | 'customer' | 'admin';

export interface AssistContext { familyId?: number | null; profileId?: number | null; isStaff?: boolean }

export interface AssistTool {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run: (input: Record<string, unknown>, ctx: AssistContext) => Promise<unknown>;
}

// --- public catalog tools -----------------------------------------------------

const listPrograms: AssistTool = {
  name: 'list_programs',
  description: 'List open/published programs from the public catalog: name, type, price, ages, season, brand, capacity state, public rating. Optionally filter by sport/type keyword or age.',
  input_schema: { type: 'object', properties: { keyword: { type: 'string' }, age: { type: 'number' } } },
  run: async (input) => {
    const db = supabaseAdmin();
    const { data } = await db
      .from('programs')
      .select('id, name, description, category, base_price_cents, min_age, max_age, season_key, brand_key, status, rating_public, program_types(name, key)')
      .in('status', ['published', 'registration_open', 'full'])
      .limit(50);
    let rows = data ?? [];
    const kw = String(input.keyword ?? '').toLowerCase();
    if (kw) rows = rows.filter((p) => `${p.name} ${p.description ?? ''} ${(p.program_types as unknown as { name: string } | null)?.name ?? ''}`.toLowerCase().includes(kw));
    if (input.age != null) rows = rows.filter((p) => (p.min_age == null || Number(input.age) >= p.min_age) && (p.max_age == null || Number(input.age) <= p.max_age));
    return rows.map((p) => ({
      id: p.id, name: p.name, type: (p.program_types as unknown as { name: string } | null)?.name,
      category: p.category, price: formatCAD(p.base_price_cents), ages: p.min_age || p.max_age ? `${p.min_age ?? '?'}-${p.max_age ?? '?'}` : 'all ages',
      season: p.season_key, brand: p.brand_key, status: p.status,
      registerUrl: `/p/${p.id}`,
    }));
  },
};

const getProgramDetails: AssistTool = {
  name: 'get_program_details',
  description: 'Full public detail for one program by id: description, price, sessions/dates, capacity state, public rating if enabled.',
  input_schema: { type: 'object', properties: { programId: { type: 'number' } }, required: ['programId'] },
  run: async (input) => {
    const db = supabaseAdmin();
    const { data: p } = await db
      .from('programs')
      .select('id, name, description, category, base_price_cents, min_age, max_age, season_key, status, capacity, rating_public, program_types(name)')
      .eq('id', Number(input.programId))
      .in('status', ['published', 'registration_open', 'full'])
      .maybeSingle();
    if (!p) return { found: false };
    const { data: sessions } = await db.from('program_sessions').select('starts_at, ends_at').eq('program_id', p.id).order('starts_at').limit(20);
    let rating: { average: number | null; responses: number } | null = null;
    if (p.rating_public) {
      const { programRating } = await import('@/lib/feedback/feedback');
      rating = await programRating(p.id);
    }
    return {
      found: true, name: p.name, description: p.description, price: formatCAD(p.base_price_cents),
      ages: `${p.min_age ?? '?'}-${p.max_age ?? '?'}`, season: p.season_key, status: p.status,
      sessions: (sessions ?? []).map((s) => s.starts_at), rating, registerUrl: `/p/${p.id}`,
    };
  },
};

const getPolicies: AssistTool = {
  name: 'get_policies',
  description: 'Published policies: refund/proration rules per program type, waiver validity, deposit rules, location and contact info.',
  input_schema: { type: 'object', properties: {} },
  run: async () => ({
    refunds: {
      league: 'Full refund minus admin fee before session 3; prorated after, with a $40 add-back per policy.',
      clinic: 'Per-session proration after the first session.',
      camp: '20%/max-$500 deposit is retained after day 1; remainder prorated.',
      dropin: 'Per-session; unused purchased sessions refundable.',
      club_academy: 'Custom / full-year commitment - handled case-by-case by staff.',
    },
    waivers: 'One waiver per family per program, valid 365 days.',
    location: 'Athlete Institute, Orangeville / Mono, Ontario.',
    hours: 'Facility hours 8:00am-11:00pm daily unless posted otherwise.',
  }),
};

// --- customer (own-household) tools ----------------------------------------------

function requireFamily(ctx: AssistContext): number {
  if (!ctx.familyId) throw new Error('No household on file for this account.');
  return ctx.familyId;
}

const myRegistrations: AssistTool = {
  name: 'my_registrations',
  description: "The caller's own household registrations: member, program, status.",
  input_schema: { type: 'object', properties: {} },
  run: async (_input, ctx) => {
    const familyId = requireFamily(ctx);
    const { data } = await supabaseAdmin()
      .from('registrations')
      .select('status, programs(name), family_members(first_name, last_name)')
      .eq('family_id', familyId)
      .in('status', ['active', 'waitlisted'])
      .limit(50);
    return (data ?? []).map((r) => ({
      member: `${(r.family_members as unknown as { first_name: string; last_name: string } | null)?.first_name ?? ''}`,
      program: (r.programs as unknown as { name: string } | null)?.name,
      status: r.status,
    }));
  },
};

const myBalance: AssistTool = {
  name: 'my_balance',
  description: "The caller's own household: outstanding balance, upcoming installments, Play Points.",
  input_schema: { type: 'object', properties: {} },
  run: async (_input, ctx) => {
    const familyId = requireFamily(ctx);
    const db = supabaseAdmin();
    const { data: fam } = await db.from('families').select('play_points_balance, credit_balance_cents, overdue').eq('id', familyId).single();
    const { data: orders } = await db.from('program_orders').select('id').eq('family_id', familyId);
    const orderIds = (orders ?? []).map((o) => o.id);
    let pending: Array<{ due: string; amount: string }> = [];
    if (orderIds.length) {
      const { data: insts } = await db.from('program_installments').select('due_date, amount_cents').in('order_id', orderIds).eq('status', 'pending').order('due_date').limit(10);
      pending = (insts ?? []).map((i) => ({ due: i.due_date, amount: formatCAD(i.amount_cents) }));
    }
    return { playPoints: fam?.play_points_balance ?? 0, creditOnAccount: formatCAD(fam?.credit_balance_cents ?? 0), overdue: fam?.overdue ?? false, upcomingPayments: pending };
  },
};

const mySchedule: AssistTool = {
  name: 'my_schedule',
  description: "The caller's own household upcoming program sessions (next 14 days).",
  input_schema: { type: 'object', properties: {} },
  run: async (_input, ctx) => {
    const familyId = requireFamily(ctx);
    const db = supabaseAdmin();
    const { data: regs } = await db.from('registrations').select('program_id').eq('family_id', familyId).eq('status', 'active');
    const programIds = [...new Set((regs ?? []).map((r) => r.program_id))];
    if (!programIds.length) return [];
    const { data: sessions } = await db
      .from('program_sessions')
      .select('starts_at, ends_at, postponed, programs(name)')
      .in('program_id', programIds)
      .gte('starts_at', new Date().toISOString())
      .lte('starts_at', new Date(Date.now() + 14 * 86_400_000).toISOString())
      .order('starts_at').limit(30);
    return (sessions ?? []).map((s) => ({ program: (s.programs as unknown as { name: string } | null)?.name, starts: s.starts_at, postponed: s.postponed }));
  },
};

// --- admin tools ------------------------------------------------------------------

function requireStaff(ctx: AssistContext): void {
  if (!ctx.isStaff) throw new Error('Staff access required.');
}

const unpaidBalances: AssistTool = {
  name: 'unpaid_balances',
  description: 'Admin: families with pending/failed installments (who has not paid), with amounts.',
  input_schema: { type: 'object', properties: {} },
  run: async (_input, ctx) => {
    requireStaff(ctx);
    const db = supabaseAdmin();
    const { data } = await db
      .from('program_installments')
      .select('amount_cents, due_date, status, program_orders(families(name))')
      .in('status', ['pending', 'failed'])
      .order('due_date').limit(50);
    return (data ?? []).map((i) => ({
      family: ((i.program_orders as unknown as { families: { name: string } | null } | null)?.families)?.name ?? 'Unknown',
      amount: formatCAD(i.amount_cents), due: i.due_date, status: i.status,
    }));
  },
};

const programStats: AssistTool = {
  name: 'program_stats',
  description: 'Admin: registration/fill/waitlist/marketing stats for a program by id, or capacity alerts across all programs.',
  input_schema: { type: 'object', properties: { programId: { type: 'number' } } },
  run: async (input, ctx) => {
    requireStaff(ctx);
    if (input.programId) {
      const { registrationReport } = await import('@/lib/reports/reports');
      return registrationReport(Number(input.programId));
    }
    const { capacityAlerts } = await import('@/lib/reports/reports');
    return capacityAlerts();
  },
};

const navigate: AssistTool = {
  name: 'navigate',
  description: 'Admin: resolve the exact admin screen for a task. Returns a route the UI opens. Known spots: programs, schedule, conflicts, rentals, staff, competitive, camps, club, academy, comms, reports, retention, feedback, gallery, dunning, promotions, points.',
  input_schema: { type: 'object', properties: { spot: { type: 'string' } }, required: ['spot'] },
  run: async (input, ctx) => {
    requireStaff(ctx);
    const spot = String(input.spot).toLowerCase();
    const routes: Record<string, string> = {
      programs: '/programs', schedule: '/schedule', conflicts: '/conflicts', rentals: '/rentals', staff: '/staff',
      competitive: '/competitive', camps: '/camps', club: '/club', academy: '/academy', comms: '/comms',
      reports: '/reports', retention: '/retention', feedback: '/feedback', gallery: '/gallery',
      dunning: '/dunning', promotions: '/promotions', points: '/points',
    };
    const match = Object.keys(routes).find((k) => spot.includes(k));
    return match ? { route: routes[match], label: match } : { route: null, suggestion: Object.keys(routes) };
  },
};

// --- registries ---------------------------------------------------------------------

export const TOOLS_BY_SURFACE: Record<Surface, AssistTool[]> = {
  public: [listPrograms, getProgramDetails, getPolicies],
  customer: [listPrograms, getProgramDetails, getPolicies, myRegistrations, myBalance, mySchedule],
  admin: [listPrograms, getProgramDetails, getPolicies, unpaidBalances, programStats, navigate],
};
