import 'server-only';
import { audit, torontoInstant, type Conflict } from '@ai/foundation';
import { notify } from '@ai/foundation/notify';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { cancelBooking, createBooking } from '@/lib/bookings';

/**
 * Media day scheduler: one photo day per division. Each team gets a timed
 * window sized from its REAL roster - team photo + one portrait slot per
 * player whose family gave photo consent at registration
 * (families.face_grouping_consent, the PIPEDA flag) - laid back-to-back with
 * buffers. The facility hold books through the Module 2 engine, so an
 * existing rental surfaces in the conflicts queue instead of double-booking.
 * Replanning cancels the old hold and rebooks.
 */

export interface MediaWindow {
  teamId: number;
  teamName: string;
  arrive: string;      // 'HH:MM'
  starts: string;
  photoEnds: string;
  ends: string;
  consented: number;
  total: number;
  noConsent: string[]; // full names, admin-side only
}

export interface MediaDayPlan {
  id: number;
  divisionId: number;
  facilityId: number;
  facilityName: string;
  bookingId: number | null;
  day: string;         // YYYY-MM-DD
  startHHMM: string;
  teamPhotoMinutes: number;
  portraitMinutes: number;
  bufferMinutes: number;
  includePortraits: boolean;
  includeCoach: boolean;
  windows: MediaWindow[];
  wrapHHMM: string;
  notifiedAt: string | null;
  conflicts?: Conflict[];
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

interface PlanInput {
  divisionId: number;
  facilityId: number;
  day: string;         // YYYY-MM-DD
  startHHMM: string;   // 'HH:MM'
  teamPhotoMinutes: number;
  portraitMinutes: number;
  bufferMinutes: number;
  includePortraits: boolean;
  includeCoach: boolean;
  actorClerkId: string;
}

/** Compute per-team windows from live rosters + consent, book the hold, persist the plan. */
export async function planMediaDay(input: PlanInput): Promise<MediaDayPlan> {
  const db = supabaseAdmin();
  const [{ data: div }, { data: teams }, { data: members }] = await Promise.all([
    db.from('divisions').select('name').eq('id', input.divisionId).single(),
    db.from('teams').select('id, name, sort_order').eq('division_id', input.divisionId).order('sort_order'),
    // families!...family_id_fkey: family_members has TWO FKs to families
    // (family_id + second_family_id, dual-household) - the embed must name one.
    db.from('team_members')
      .select('id, team_id, registrations(family_members(first_name, last_name, families!family_members_family_id_fkey(face_grouping_consent)))')
      .eq('division_id', input.divisionId),
  ]);
  if (!div) throw new Error('Division not found.');
  if (!teams?.length) throw new Error('No teams yet - build teams before scheduling media day.');

  interface MemberLite { teamId: number | null; name: string; consented: boolean }
  const lite: MemberLite[] = (members ?? []).map((m) => {
    const fm = (m.registrations as unknown as { family_members: { first_name: string; last_name: string; families: { face_grouping_consent: boolean } | null } | null } | null)?.family_members ?? null;
    return {
      teamId: m.team_id,
      name: fm ? `${fm.first_name} ${fm.last_name}` : 'Unlinked registration',
      consented: fm?.families?.face_grouping_consent ?? false,
    };
  });

  let t = toMin(input.startHHMM);
  const windows: MediaWindow[] = teams.map((team) => {
    const roster = lite.filter((m) => m.teamId === team.id);
    const consented = roster.filter((m) => m.consented);
    const noConsent = roster.filter((m) => !m.consented).map((m) => m.name);
    const starts = t;
    const photoEnds = starts + input.teamPhotoMinutes;
    const ends = input.includePortraits ? photoEnds + consented.length * input.portraitMinutes : photoEnds;
    t = ends + input.bufferMinutes;
    return {
      teamId: team.id,
      teamName: team.name,
      arrive: toHHMM(Math.max(0, starts - 10)),
      starts: toHHMM(starts),
      photoEnds: toHHMM(photoEnds),
      ends: toHHMM(ends),
      consented: consented.length,
      total: roster.length,
      noConsent,
    };
  });
  const wrapHHMM = windows.length ? windows[windows.length - 1].ends : input.startHHMM;

  // Replace any existing plan: cancel the previous hold, keep one row per division.
  const { data: existing } = await db.from('media_days').select('id, booking_id').eq('division_id', input.divisionId).maybeSingle();
  if (existing?.booking_id) {
    try { await cancelBooking(existing.booking_id, input.actorClerkId, 'media day replanned'); } catch { /* already cancelled */ }
  }

  const row = {
    division_id: input.divisionId,
    facility_id: input.facilityId,
    day: input.day,
    start_hhmm: input.startHHMM,
    team_photo_minutes: input.teamPhotoMinutes,
    portrait_minutes: input.portraitMinutes,
    buffer_minutes: input.bufferMinutes,
    include_portraits: input.includePortraits,
    include_coach: input.includeCoach,
    windows,
    notified_at: null,
  };
  let mediaDayId: number;
  if (existing) {
    const { error } = await db.from('media_days').update(row).eq('id', existing.id);
    if (error) throw new Error(error.message);
    mediaDayId = existing.id;
  } else {
    const { data: ins, error } = await db.from('media_days').insert({ ...row, created_by: input.actorClerkId }).select('id').single();
    if (error) throw new Error(error.message);
    mediaDayId = ins.id;
  }

  const booking = await createBooking({
    facilityId: input.facilityId,
    startsAt: torontoInstant(input.day, input.startHHMM),
    endsAt: torontoInstant(input.day, wrapHHMM),
    source: 'event',
    title: `Media Day: ${div.name}`,
    sourceRef: `media-day:${mediaDayId}`,
    showOnPublicSchedule: false,
    actorClerkId: input.actorClerkId,
  });
  await db.from('media_days').update({ booking_id: booking.booking.id }).eq('id', mediaDayId);

  await audit({ actorId: input.actorClerkId, action: 'division.media-day-planned', target: `division:${input.divisionId}`, meta: { mediaDayId, day: input.day, teams: windows.length, conflicts: booking.conflicts.length } });
  const plan = await getMediaDay(input.divisionId);
  return { ...plan!, conflicts: booking.conflicts };
}

/** The division's current plan (null until one is built). */
export async function getMediaDay(divisionId: number): Promise<MediaDayPlan | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('media_days')
    .select('id, division_id, facility_id, booking_id, day, start_hhmm, team_photo_minutes, portrait_minutes, buffer_minutes, include_portraits, include_coach, windows, notified_at, facilities(name)')
    .eq('division_id', divisionId)
    .maybeSingle();
  if (!data) return null;
  const windows = (data.windows as MediaWindow[] | null) ?? [];
  return {
    id: data.id,
    divisionId: data.division_id,
    facilityId: data.facility_id,
    facilityName: (data.facilities as unknown as { name: string } | null)?.name ?? '',
    bookingId: data.booking_id,
    day: data.day,
    startHHMM: data.start_hhmm,
    teamPhotoMinutes: data.team_photo_minutes,
    portraitMinutes: data.portrait_minutes,
    bufferMinutes: data.buffer_minutes,
    includePortraits: data.include_portraits,
    includeCoach: data.include_coach,
    windows,
    wrapHHMM: windows.length ? windows[windows.length - 1].ends : data.start_hhmm,
    notifiedAt: data.notified_at,
  };
}

/**
 * One message per family per team window: team, arrival time, bring the
 * jersey. Households with kids on two teams get one message per team.
 */
export async function notifyMediaDayFamilies(divisionId: number, actorClerkId: string): Promise<{ emailed: number; skipped: number }> {
  const db = supabaseAdmin();
  const plan = await getMediaDay(divisionId);
  if (!plan) throw new Error('No media day planned yet.');
  const { data: div } = await db.from('divisions').select('name').eq('id', divisionId).single();
  const { data: members } = await db
    .from('team_members')
    .select('team_id, registrations(family_id)')
    .eq('division_id', divisionId);

  // team -> distinct family ids
  const famsByTeam = new Map<number, Set<number>>();
  for (const m of members ?? []) {
    const famId = (m.registrations as unknown as { family_id: number | null } | null)?.family_id ?? null;
    if (!famId || !m.team_id) continue;
    if (!famsByTeam.has(m.team_id)) famsByTeam.set(m.team_id, new Set());
    famsByTeam.get(m.team_id)!.add(famId);
  }
  const allFamIds = [...new Set([...famsByTeam.values()].flatMap((s) => [...s]))];
  const { data: fams } = allFamIds.length
    ? await db.from('families').select('id, hoh_profile_id, profiles!families_hoh_profile_id_fkey(email)').in('id', allFamIds)
    : { data: [] as never[] };
  const emailByFam = new Map((fams ?? []).map((f) => [f.id as number, ((f as unknown as { profiles: { email: string | null } | null }).profiles?.email) ?? null]));

  const dayLabel = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(plan.day + 'T12:00:00'));
  let emailed = 0; let skipped = 0;
  for (const w of plan.windows) {
    for (const famId of famsByTeam.get(w.teamId) ?? []) {
      const email = emailByFam.get(famId);
      if (!email) { skipped++; continue; }
      await notify({
        to: { email },
        channels: ['email'],
        template: 'generic',
        data: {
          heading: `Media day: ${w.teamName} - ${dayLabel}`,
          body: `${w.teamName} (${div?.name ?? ''}) has photo day on ${dayLabel} at ${plan.facilityName}. Please arrive by ${w.arrive} with the jersey on - team photo at ${w.starts}${plan.includePortraits ? ', individual portraits right after' : ''}. The whole window wraps by ${w.ends}.`,
        },
      });
      emailed++;
    }
  }
  await db.from('media_days').update({ notified_at: new Date().toISOString() }).eq('id', plan.id);
  await audit({ actorId: actorClerkId, action: 'division.media-day-notified', target: `division:${divisionId}`, meta: { emailed, skipped } });
  return { emailed, skipped };
}
