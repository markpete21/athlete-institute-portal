import 'server-only';
import { audit } from '@ai/foundation';
import { BUCKETS, getSignedThumbUrl, getSignedUrl, uploadFile } from '@ai/foundation/storage';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { fireTrigger } from '@/lib/comms/notifications';

/**
 * Photo & Video Gallery (Module 17). Staff upload to a program/session; the
 * gallery AUTO-POPULATES in each enrolled family's portal (visibility follows
 * enrollment - no manual sharing). Cost control baked in: browse serves resized
 * thumbnails / poster frames only; full-res originals only on explicit
 * download; video streams via the existing live-stream HLS pipeline (a
 * video_stream_ref), never raw files from Storage.
 */

const BUCKET = BUCKETS.galleryMedia;

// --- staff: create + upload -------------------------------------------------

export async function createGallery(input: { programId: number; sessionId?: number | null; title: string }, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('galleries')
    .insert({ program_id: input.programId, session_id: input.sessionId ?? null, title: input.title.trim(), created_by: actorClerkId })
    .select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'gallery.created', target: `gallery:${data.id}`, meta: { program: input.programId } });
  return data.id;
}

/** Upload a photo (original into Storage; browse always uses transforms). */
export async function addPhoto(galleryId: number, file: { name: string; body: Buffer | ArrayBuffer; contentType: string }, actorClerkId: string, caption?: string | null): Promise<number> {
  const path = `${galleryId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  await uploadFile(BUCKET, path, file.body, { contentType: file.contentType });
  const { data, error } = await supabaseAdmin()
    .from('gallery_media')
    .insert({ gallery_id: galleryId, kind: 'photo', storage_path: path, caption: caption ?? null, bytes: 'byteLength' in file.body ? file.body.byteLength : (file.body as Buffer).length })
    .select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'gallery.photo-added', target: `gallery:${galleryId}` });
  return data.id;
}

/**
 * Register a video by its streaming-pipeline reference (the live-stream infra
 * transcodes + serves HLS; we never store/serve raw video from this bucket).
 */
export async function addVideo(galleryId: number, input: { streamRef: string; posterPath?: string | null; caption?: string | null }, actorClerkId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('gallery_media')
    .insert({ gallery_id: galleryId, kind: 'video', video_stream_ref: input.streamRef, poster_path: input.posterPath ?? null, caption: input.caption ?? null })
    .select('id').single();
  if (error) throw new Error(error.message);
  await audit({ actorId: actorClerkId, action: 'gallery.video-added', target: `gallery:${galleryId}` });
  return data.id;
}

/** Notify enrolled families of new media (M13 editable trigger). */
export async function notifyNewMedia(galleryId: number): Promise<number> {
  const db = supabaseAdmin();
  const { data: gallery } = await db.from('galleries').select('program_id, programs(name)').eq('id', galleryId).single();
  if (!gallery) return 0;
  const { data: regs } = await db.from('registrations').select('family_id').eq('program_id', gallery.program_id).eq('status', 'active');
  const familyIds = [...new Set((regs ?? []).map((r) => r.family_id).filter((x): x is number => x != null))];
  let notified = 0;
  for (const familyId of familyIds) {
    const { data: fam } = await db.from('families').select('hoh_profile_id').eq('id', familyId).maybeSingle();
    if (!fam?.hoh_profile_id) continue;
    const { data: prof } = await db.from('profiles').select('email').eq('id', fam.hoh_profile_id).maybeSingle();
    if (!prof?.email) continue;
    await fireTrigger('gallery.new_media', { email: prof.email }, {
      program_name: (gallery.programs as unknown as { name: string } | null)?.name ?? 'your program',
      gallery_url: `${process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca'}/gallery`,
    });
    notified += 1;
  }
  return notified;
}

// --- family: enrollment-scoped visibility ------------------------------------

export interface GalleryView { id: number; title: string; programName: string; mediaCount: number; archived: boolean }

/** Galleries this family can see = programs where they hold an active registration. */
export async function galleriesForFamily(familyId: number): Promise<GalleryView[]> {
  const db = supabaseAdmin();
  const { data: regs } = await db.from('registrations').select('program_id').eq('family_id', familyId).in('status', ['active']);
  const programIds = [...new Set((regs ?? []).map((r) => r.program_id))];
  if (programIds.length === 0) return [];
  const { data: galleries } = await db
    .from('galleries')
    .select('id, title, archived_at, programs(name)')
    .in('program_id', programIds)
    .order('id', { ascending: false });
  const out: GalleryView[] = [];
  for (const g of galleries ?? []) {
    const { count } = await db.from('gallery_media').select('id', { count: 'exact', head: true }).eq('gallery_id', g.id);
    out.push({ id: g.id, title: g.title, programName: (g.programs as unknown as { name: string } | null)?.name ?? '', mediaCount: count ?? 0, archived: !!g.archived_at });
  }
  return out;
}

/** True if the family's enrollments include this gallery's program. */
export async function familyCanSee(galleryId: number, familyId: number): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: g } = await db.from('galleries').select('program_id').eq('id', galleryId).maybeSingle();
  if (!g) return false;
  const { count } = await db.from('registrations').select('id', { count: 'exact', head: true }).eq('family_id', familyId).eq('program_id', g.program_id).eq('status', 'active');
  return (count ?? 0) > 0;
}

export interface MediaBrowseItem {
  id: number;
  kind: 'photo' | 'video';
  caption: string | null;
  /** Resized thumbnail (photos) or poster frame (video) - NEVER the original. */
  thumbUrl: string | null;
  /** HLS playback URL for video (streaming pipeline), null for photos. */
  streamUrl: string | null;
}

/**
 * Browse view: thumbnails/posters only (cost control). Video returns a
 * streaming URL derived from the pipeline ref, never a raw file.
 */
export async function browseGallery(galleryId: number): Promise<MediaBrowseItem[]> {
  const db = supabaseAdmin();
  const { data: media } = await db.from('gallery_media').select('id, kind, caption, storage_path, video_stream_ref, poster_path').eq('gallery_id', galleryId).order('id');
  const streamBase = process.env.STREAM_PLAYBACK_BASE ?? 'https://live.athleteinstitute.ca/watch';
  const out: MediaBrowseItem[] = [];
  for (const m of media ?? []) {
    let thumbUrl: string | null = null;
    if (m.kind === 'photo' && m.storage_path) thumbUrl = await getSignedThumbUrl(BUCKET, m.storage_path, 480);
    if (m.kind === 'video' && m.poster_path) thumbUrl = await getSignedThumbUrl(BUCKET, m.poster_path, 480);
    out.push({
      id: m.id, kind: m.kind as 'photo' | 'video', caption: m.caption,
      thumbUrl,
      streamUrl: m.kind === 'video' && m.video_stream_ref ? `${streamBase}/${m.video_stream_ref}` : null,
    });
  }
  return out;
}

/** Explicit download: full-res original signed URLs (single or multi-select). */
export async function downloadUrls(mediaIds: number[]): Promise<Array<{ id: number; name: string; url: string }>> {
  const db = supabaseAdmin();
  const { data: media } = await db.from('gallery_media').select('id, kind, storage_path').in('id', mediaIds).eq('kind', 'photo');
  const out: Array<{ id: number; name: string; url: string }> = [];
  for (const m of media ?? []) {
    if (!m.storage_path) continue;
    out.push({ id: m.id, name: m.storage_path.split('/').pop()!, url: await getSignedUrl(BUCKET, m.storage_path, 900) });
  }
  return out;
}

// --- lifecycle archiving ------------------------------------------------------

/** Archive galleries older than N months (download activity craters post-season). */
export async function archiveOldGalleries(olderThanMonths = 6): Promise<number> {
  const db = supabaseAdmin();
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - olderThanMonths);
  const { data } = await db
    .from('galleries')
    .update({ archived_at: new Date().toISOString() })
    .is('archived_at', null)
    .lt('created_at', cutoff.toISOString())
    .select('id');
  return (data ?? []).length;
}
