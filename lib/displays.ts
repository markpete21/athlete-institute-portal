import 'server-only';
import { randomBytes } from 'node:crypto';
import { audit, descendantIds, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listBookings, type BookingRecord } from '@/lib/bookings';
import { torontoDateOf } from '@/lib/schedule-views';

/**
 * TV displays (Module 2 Stage 6). A display = unguessable token URL + a
 * template (media panel + content switches) + a facility scope. The public
 * page shows ONLY bookings flagged show_on_public_schedule - private rentals
 * and internal ops never appear on a lobby TV.
 */

export interface DisplayTemplate {
  id: number;
  name: string;
  media_mode: 'image' | 'video' | 'slideshow';
  media_urls: string[];
  show_today: boolean;
  show_upcoming: boolean;
  slide_seconds: number;
}

export interface Display {
  id: number;
  token: string;
  name: string;
  template_id: number | null;
  facility_ids: number[];
}

const T_COLS = 'id, name, media_mode, media_urls, show_today, show_upcoming, slide_seconds';
const D_COLS = 'id, token, name, template_id, facility_ids';

export async function listTemplates(): Promise<DisplayTemplate[]> {
  const { data, error } = await supabaseAdmin().from('display_templates').select(T_COLS).order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as DisplayTemplate[];
}

export async function upsertTemplate(
  input: Partial<DisplayTemplate> & { name: string },
  actorClerkId: string,
): Promise<DisplayTemplate> {
  const { data, error } = await supabaseAdmin()
    .from('display_templates')
    .upsert(
      {
        name: input.name.trim(),
        media_mode: input.media_mode ?? 'image',
        media_urls: input.media_urls ?? [],
        show_today: input.show_today ?? true,
        show_upcoming: input.show_upcoming ?? true,
        slide_seconds: input.slide_seconds ?? 8,
        created_by: actorClerkId,
      },
      { onConflict: 'name' },
    )
    .select(T_COLS)
    .single();
  if (error) throw new Error(`template save failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'display_template.saved', target: `display_template:${data.id}`, meta: { name: input.name } });
  return data as DisplayTemplate;
}

export async function listDisplays(): Promise<Display[]> {
  const { data, error } = await supabaseAdmin().from('displays').select(D_COLS).order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Display[];
}

export async function createDisplay(
  input: { name: string; templateId: number | null; facilityIds: number[] },
  actorClerkId: string,
): Promise<Display> {
  const token = randomBytes(24).toString('base64url'); // unguessable URL token
  const { data, error } = await supabaseAdmin()
    .from('displays')
    .insert({
      token,
      name: input.name.trim(),
      template_id: input.templateId,
      facility_ids: input.facilityIds,
      created_by: actorClerkId,
    })
    .select(D_COLS)
    .single();
  if (error) throw new Error(`display create failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'display.created', target: `display:${data.id}`, meta: { name: input.name } });
  return data as Display;
}

export async function deleteDisplay(id: number, actorClerkId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('displays').delete().eq('id', id);
  if (error) throw new Error(`display delete failed: ${error.message}`);
  await audit({ actorId: actorClerkId, action: 'display.deleted', target: `display:${id}` });
}

export interface DisplayContent {
  display: Display;
  template: DisplayTemplate | null;
  todaysBookings: BookingRecord[];
  upcoming: BookingRecord[]; // next 4 weeks, after today
  facilityNames: Map<number, string>;
}

/** Everything the public display page renders, by token. Null = unknown token. */
export async function getDisplayContent(token: string): Promise<DisplayContent | null> {
  const db = supabaseAdmin();
  const { data: display, error } = await db.from('displays').select(D_COLS).eq('token', token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!display) return null;

  const template = display.template_id
    ? ((await db.from('display_templates').select(T_COLS).eq('id', display.template_id).maybeSingle()).data as DisplayTemplate | null)
    : null;

  const { data: facRows } = await db
    .from('facilities')
    .select('id, parent_id, name, label, sort_order, bookable, deleted_at')
    .is('deleted_at', null);
  const tree = (facRows ?? []) as FacilityNode[];

  // Facility scope: selected nodes + their subtrees (empty scope = everything).
  let scope: Set<number> | null = null;
  const ids = (display.facility_ids ?? []) as number[];
  if (ids.length) {
    scope = new Set<number>();
    for (const id of ids) {
      scope.add(id);
      for (const d of descendantIds(tree, id)) scope.add(d);
    }
  }

  const today = torontoDateOf(new Date().toISOString());
  const in4Weeks = new Date(Date.now() + 28 * 86400_000).toISOString();
  const all = await listBookings({
    from: `${today}T00:00:00-05:00`,
    to: in4Weeks,
    publicOnly: true, // only display-appropriate bookings, ever
  });
  const scoped = scope ? all.filter((b) => scope.has(b.facility_id)) : all;

  return {
    display: display as Display,
    template,
    todaysBookings: scoped.filter((b) => torontoDateOf(b.starts_at) === today),
    upcoming: scoped.filter((b) => torontoDateOf(b.starts_at) > today),
    facilityNames: new Map(tree.map((f) => [f.id, f.name])),
  };
}
