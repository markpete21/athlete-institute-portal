import 'server-only';
import { torontoToday } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { BUCKETS, getSignedUrl } from '@ai/foundation/storage';

/**
 * Play App account data (public side). Assembles one household view from the
 * modules that own each piece: Module 2 bookings for the schedule spine, M4
 * registrations/orders/installments for money, M19 for points, M1 for the
 * household. Children are colour-KEYED (not filtered) so the whole household
 * reads at once; the key is derived from member order so it is stable.
 */

/** Child colour keys, deliberately outside the brand palette (brands are red/gold). */
export const MEMBER_COLOURS = ['#2f6b6b', '#4a4f8a', '#7a4a6b', '#5c6b34', '#8a5a2f', '#3f5f7a'] as const;

export interface Member {
  id: number;
  name: string;
  firstName: string;
  initials: string;
  colour: string;
  isAdult: boolean;
  photoUrl: string | null;
  /** Dual-household child (lives on this roster AND another household's). */
  shared: boolean;
}

export interface SessionRow {
  bookingId: number;
  memberId: number | null;
  startsAt: string;
  endsAt: string;
  title: string;
  facility: string | null;
  brandKey: string | null;
  isGame: boolean;
}

export interface DayGroup { date: string; weekday: string; dayNum: string; month: string; isToday: boolean; sessions: SessionRow[] }

export interface AttentionItem {
  kind: 'payment' | 'waiver' | 'jersey' | 'consent' | 'waitlist';
  memberId: number | null;
  title: string;
  detail: string;
  cta: string;
  href: string;
  urgent: boolean;
}

export interface RegistrationRow {
  id: number;
  memberId: number | null;
  programName: string;
  seasonKey: string | null;
  status: string;
  waitlistPosition: number | null;
  brandKey: string | null;
}

export interface AccountView {
  familyId: number | null;
  familyName: string | null;
  members: Member[];
  days: DayGroup[];
  attention: AttentionItem[];
  registrations: RegistrationRow[];
  balance: { owedCents: number; nextDueCents: number; nextDueDate: string | null; paidCount: number; totalCount: number; creditCents: number };
  points: { balance: number; dollarValue: number };
  waiversSigned: boolean;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const torontoParts = (iso: string) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date(iso)); // YYYY-MM-DD
};

/** A stable colour per member, by their order within the household. */
function colourFor(index: number): string {
  return MEMBER_COLOURS[index % MEMBER_COLOURS.length];
}

async function memberPhoto(row: { photo_url: string | null; photo_path: string | null }): Promise<string | null> {
  if (row.photo_path) {
    // Children's photos live in a PRIVATE bucket — serve a short-lived signed URL.
    try { return await getSignedUrl(BUCKETS.memberPhotos, row.photo_path, 3600); } catch { /* fall through */ }
  }
  return row.photo_url ?? null;
}

/**
 * Everything the account page needs, for one household. Returns an empty view
 * (not an error) when the visitor has no household yet, so the page can render
 * a sensible first-run state.
 */
export async function accountView(familyId: number | null, days = 14): Promise<AccountView> {
  const db = supabaseAdmin();
  const empty: AccountView = {
    familyId, familyName: null, members: [], days: [], attention: [], registrations: [],
    balance: { owedCents: 0, nextDueCents: 0, nextDueDate: null, paidCount: 0, totalCount: 0, creditCents: 0 },
    points: { balance: 0, dollarValue: 0 }, waiversSigned: true,
  };
  if (!familyId) return empty;

  const { data: fam } = await db.from('families').select('id, name, play_points_balance, credit_balance_cents').eq('id', familyId).maybeSingle();
  if (!fam) return empty;

  // --- members (colour-keyed, photos signed) --------------------------------
  // Includes dependents shared into this household from another one
  // (dual-household children read as full roster members on both sides).
  const { data: memberRows } = await db
    .from('family_members')
    .select('id, first_name, last_name, member_role, dob, photo_url, photo_path, family_id, second_family_id')
    .or(`family_id.eq.${familyId},second_family_id.eq.${familyId}`)
    .order('id');
  const members: Member[] = [];
  for (const [i, m] of (memberRows ?? []).entries()) {
    members.push({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`.trim(),
      firstName: m.first_name,
      initials: `${m.first_name?.[0] ?? ''}`.toUpperCase() || '?',
      colour: colourFor(i),
      isAdult: m.member_role === 'hoh' || m.member_role === 'adult' || m.member_role === 'secondary',
      photoUrl: await memberPhoto(m),
      shared: m.second_family_id != null,
    });
  }
  const colourByMember = new Map(members.map((m) => [m.id, m.colour]));

  // --- registrations (drives both the roster list and the spine) ------------
  // Two nets: registrations this household PAID for, and registrations for a
  // shared child that the OTHER household paid for (both parents see the
  // child's programs; only the paying household sees the money).
  const memberIds = members.map((m) => m.id);
  const { data: regRows } = await db
    .from('registrations')
    .select('id, family_member_id, family_id, status, waitlist_position, season_key, program_id, programs(name, brand_key)')
    .or(`family_id.eq.${familyId}${memberIds.length ? `,family_member_id.in.(${memberIds.join(',')})` : ''}`)
    .in('status', ['active', 'waitlisted']);
  const registrations: RegistrationRow[] = (regRows ?? []).map((r) => {
    const p = r.programs as unknown as { name: string; brand_key: string | null } | null;
    return {
      id: r.id, memberId: r.family_member_id, programName: p?.name ?? 'Program',
      seasonKey: r.season_key, status: r.status, waitlistPosition: r.waitlist_position, brandKey: p?.brand_key ?? null,
    };
  });

  // --- the schedule spine ---------------------------------------------------
  // Two sources: bookings tagged to this household (rentals/family events) and
  // program sessions for programs this household is registered in.
  const nowISO = new Date().toISOString();
  const untilISO = new Date(Date.now() + days * 86_400_000).toISOString();
  const programIds = [...new Set((regRows ?? []).map((r) => r.program_id))];
  const memberByProgram = new Map<number, number | null>();
  for (const r of regRows ?? []) if (!memberByProgram.has(r.program_id)) memberByProgram.set(r.program_id, r.family_member_id);
  const brandByProgram = new Map<number, string | null>();
  for (const r of regRows ?? []) brandByProgram.set(r.program_id, (r.programs as unknown as { brand_key: string | null } | null)?.brand_key ?? null);

  const sessions: SessionRow[] = [];

  if (programIds.length) {
    const { data: ps } = await db
      .from('program_sessions')
      .select('id, program_id, starts_at, ends_at, booking_id, postponed, bookings(title, facility_id)')
      .in('program_id', programIds)
      .gte('starts_at', nowISO)
      .lt('starts_at', untilISO)
      .order('starts_at');
    // Facility names in one lookup rather than per row.
    const facIds = [...new Set((ps ?? []).map((s) => (s.bookings as unknown as { facility_id: number } | null)?.facility_id).filter(Boolean))] as number[];
    const { data: facs } = facIds.length ? await db.from('facilities').select('id, name').in('id', facIds) : { data: [] };
    const facName = new Map((facs ?? []).map((f) => [f.id, f.name]));
    for (const s of ps ?? []) {
      if (s.postponed) continue;
      const b = s.bookings as unknown as { title: string; facility_id: number } | null;
      const { data: prog } = await db.from('programs').select('name').eq('id', s.program_id).maybeSingle();
      sessions.push({
        bookingId: s.booking_id ?? s.id,
        memberId: memberByProgram.get(s.program_id) ?? null,
        startsAt: s.starts_at, endsAt: s.ends_at,
        title: prog?.name ?? b?.title ?? 'Session',
        facility: b ? facName.get(b.facility_id) ?? null : null,
        brandKey: brandByProgram.get(s.program_id) ?? null,
        isGame: false,
      });
    }
  }

  // Games from Module 6 for divisions this household has a roster spot in.
  const { data: games } = await db
    .from('games')
    .select('id, starts_at, home_team_id, away_team_id, division_id, status')
    .gte('starts_at', nowISO).lt('starts_at', untilISO).neq('status', 'final').order('starts_at');
  if ((games ?? []).length) {
    const { data: mine } = await db
      .from('team_members')
      .select('team_id, registration_id')
      .in('registration_id', registrations.map((r) => r.id).length ? registrations.map((r) => r.id) : [-1]);
    const myTeams = new Set((mine ?? []).map((t) => t.team_id));
    for (const g of games ?? []) {
      if (!myTeams.has(g.home_team_id) && !myTeams.has(g.away_team_id)) continue;
      sessions.push({
        bookingId: g.id, memberId: null, startsAt: g.starts_at, endsAt: g.starts_at,
        title: 'Game', facility: null, brandKey: null, isGame: true,
      });
    }
  }

  // --- group into days across the window -----------------------------------
  const today = torontoToday();
  const byDate = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const d = torontoParts(s.startsAt);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(s);
  }
  const dayGroups: DayGroup[] = [];
  for (let i = 0; i < days; i += 1) {
    const dt = new Date(Date.now() + i * 86_400_000);
    const date = torontoParts(dt.toISOString());
    const [y, m, d] = date.split('-').map(Number);
    const local = new Date(Date.UTC(y, m - 1, d, 12));
    dayGroups.push({
      date,
      weekday: WD[local.getUTCDay()],
      dayNum: String(d),
      month: MO[m - 1],
      isToday: date === today,
      sessions: (byDate.get(date) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    });
  }
  // Trim trailing empty days so the spine doesn't end in a wall of nothing.
  while (dayGroups.length > 1 && dayGroups[dayGroups.length - 1].sessions.length === 0) dayGroups.pop();

  // --- money ---------------------------------------------------------------
  const { data: orders } = await db.from('program_orders').select('id, total_cents, status').eq('family_id', familyId);
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: inst } = orderIds.length
    ? await db.from('program_installments').select('amount_cents, due_date, status').in('order_id', orderIds).order('due_date')
    : { data: [] };
  const rows = inst ?? [];
  const unpaid = rows.filter((i) => i.status === 'pending' || i.status === 'failed');
  const next = unpaid[0] ?? null;
  const balance = {
    owedCents: unpaid.reduce((a, i) => a + (i.amount_cents ?? 0), 0),
    nextDueCents: next?.amount_cents ?? 0,
    nextDueDate: next?.due_date ?? null,
    paidCount: rows.filter((i) => i.status === 'paid').length,
    totalCount: rows.length,
    creditCents: fam.credit_balance_cents ?? 0,
  };

  // --- attention (the block that vanishes when empty) ----------------------
  const attention: AttentionItem[] = [];
  if (balance.nextDueCents > 0 && balance.nextDueDate) {
    attention.push({
      kind: 'payment', memberId: null,
      title: `Payment due ${new Date(`${balance.nextDueDate}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`,
      detail: `$${(balance.nextDueCents / 100).toFixed(2)} on your payment plan`,
      cta: 'Pay now', href: '/account/pay', urgent: true,
    });
  }
  for (const r of registrations.filter((x) => x.status === 'waitlisted')) {
    const who = members.find((m) => m.id === r.memberId);
    attention.push({
      kind: 'waitlist', memberId: r.memberId, title: `Waitlisted for ${r.programName}`,
      detail: `${who ? `${who.firstName} · ` : ''}position ${r.waitlistPosition ?? '—'}`,
      cta: 'View', href: '/programs', urgent: false,
    });
  }
  // waiver_signatures is keyed by (entity_type, entity_id) - not family - so ask
  // the Module 3/4 helper, which encodes the one-per-family-per-program rule.
  // Only registrations THIS household placed need its signature — a shared
  // child's programs paid by the other household are theirs to sign for.
  const { isProgramWaiverSatisfied } = await import('@/lib/waivers');
  let waiversSigned = true;
  for (const pid of [...new Set((regRows ?? []).filter((r) => r.family_id === familyId).map((r) => r.program_id))]) {
    if (!(await isProgramWaiverSatisfied(pid, familyId))) { waiversSigned = false; break; }
  }
  if (!waiversSigned) {
    attention.push({
      kind: 'waiver', memberId: null, title: 'Waiver needs signing',
      detail: 'Required before your first session', cta: 'Sign', href: '/account/waivers', urgent: true,
    });
  }
  for (const m of members.filter((x) => !x.isAdult && !x.photoUrl)) {
    attention.push({
      kind: 'consent', memberId: m.id, title: `Add a photo for ${m.firstName}`,
      detail: 'Helps coaches and staff at check-in', cta: 'Add photo', href: '/account/members', urgent: false,
    });
  }

  return {
    familyId, familyName: fam.name, members, days: dayGroups, attention, registrations, balance,
    points: { balance: fam.play_points_balance ?? 0, dollarValue: (fam.play_points_balance ?? 0) / 100 },
    waiversSigned,
  };
}
