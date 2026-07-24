import { NextResponse } from 'next/server';
import { ensureBuckets } from '@ai/foundation/storage';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createProgram, listProgramTypes } from '@/lib/programs/programs';
import { addPhoto, addVideo, browseGallery, createGallery, downloadUrls, familyCanSee, galleriesForFamily, notifyNewMedia } from '@/lib/gallery/gallery';
import { buildZip } from '@/lib/gallery/zip';

/**
 * DEV-ONLY: Module 17 - enrollment-scoped visibility, thumbnail-vs-original
 * separation, video streams (never raw), multi-select zip, notify fan-out.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const programIds: number[] = [];
  const famIds: number[] = [];
  const profileIds: number[] = [];
  let galleryId: number | null = null;
  const paths: string[] = [];

  try {
    await ensureBuckets(); // gallery-media is new - create idempotently

    const league = (await listProgramTypes()).find((t) => t.key === 'league')!;
    const prog = await createProgram({ name: 'Gallery Program', programTypeId: league.id, actorClerkId: 'system:verify' });
    programIds.push(prog.id);
    await db.from('programs').update({ status: 'registration_open' }).eq('id', prog.id);

    // Enrolled family + a NON-enrolled family.
    const mkFam = async (n: string) => {
      const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `gal-${n}-${prog.id}`, email: `gal-${n}-${prog.id}@example.test` }).select('id').single();
      profileIds.push(prof!.id);
      const { data: fam } = await db.from('families').insert({ name: `Gal ${n}`, hoh_profile_id: prof!.id }).select('id').single();
      famIds.push(fam!.id);
      return fam!.id;
    };
    const enrolled = await mkFam('in');
    const outsider = await mkFam('out');
    const { data: mem } = await db.from('family_members').insert({ family_id: enrolled, first_name: 'G', last_name: 'K', member_role: 'dependent' }).select('id').single();
    await db.from('registrations').insert({ program_id: prog.id, family_id: enrolled, family_member_id: mem!.id, status: 'active', standing: 'brand_new' });

    // 1. staff create + upload a real photo (1x1 PNG)
    galleryId = await createGallery({ programId: prog.id, title: 'Verify Gallery' }, 'system:verify');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const photoId = await addPhoto(galleryId, { name: 'shot1.png', body: png, contentType: 'image/png' }, 'system:verify');
    const photo2 = await addPhoto(galleryId, { name: 'shot2.png', body: png, contentType: 'image/png' }, 'system:verify');
    const videoId = await addVideo(galleryId, { streamRef: 'verify-stream-123', caption: 'Game film' }, 'system:verify');
    record('upload: photos to Storage + video by stream ref', photoId > 0 && photo2 > 0 && videoId > 0, `${photoId},${photo2},${videoId}`);
    const { data: mediaRows } = await db.from('gallery_media').select('storage_path').eq('gallery_id', galleryId).eq('kind', 'photo');
    paths.push(...(mediaRows ?? []).map((m) => m.storage_path!));

    // 2. enrollment-scoped visibility
    const forEnrolled = await galleriesForFamily(enrolled);
    const forOutsider = await galleriesForFamily(outsider);
    record('enrolled family sees the gallery', forEnrolled.some((g) => g.id === galleryId), `${forEnrolled.length}`);
    record('non-enrolled family does NOT', forOutsider.length === 0 && !(await familyCanSee(galleryId, outsider)), `${forOutsider.length}`);

    // 3. browse serves THUMBNAILS (transform render path), video streams (no raw file)
    const browse = await browseGallery(galleryId);
    const photoItem = browse.find((b) => b.id === photoId)!;
    const videoItem = browse.find((b) => b.id === videoId)!;
    record('browse photo = resized transform URL (not original)', !!photoItem.thumbUrl && photoItem.thumbUrl.includes('/render/image/'), photoItem.thumbUrl?.slice(0, 80) ?? 'none');
    record('video = streaming URL, never raw storage', !!videoItem.streamUrl && videoItem.streamUrl.includes('verify-stream-123') && !videoItem.streamUrl.includes('supabase'), videoItem.streamUrl ?? 'none');

    // 4. download = full-res original (plain object path, no transform)
    const dl = await downloadUrls([photoId, photo2]);
    record('download = original signed URLs (multi-select)', dl.length === 2 && dl.every((d) => !d.url.includes('/render/image/')), `${dl.length} urls`);

    // 5. zip build from the originals
    const bufs = [];
    for (const d of dl) {
      const res = await fetch(d.url, { cache: 'no-store' });
      bufs.push({ name: d.name, data: new Uint8Array(await res.arrayBuffer()) });
    }
    const zip = buildZip(bufs);
    record('multi-select zip assembles', zip.length > 100 && zip.readUInt32LE(0) === 0x04034b50, `${zip.length} bytes`);

    // 6. new-upload notification fan-out to enrolled families only
    const notified = await notifyNewMedia(galleryId);
    record('notify fan-out = enrolled families only', notified === 1, `${notified} notified`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (paths.length) { const { deleteFile, BUCKETS } = await import('@ai/foundation/storage'); await deleteFile(BUCKETS.galleryMedia, paths).catch(() => {}); }
    if (galleryId) { await db.from('gallery_media').delete().eq('gallery_id', galleryId); await db.from('galleries').delete().eq('id', galleryId); }
    if (programIds.length) { await db.from('registrations').delete().in('program_id', programIds); await db.from('programs').delete().in('id', programIds); }
    if (famIds.length) { await db.from('family_members').delete().in('family_id', famIds); await db.from('families').delete().in('id', famIds); }
    if (profileIds.length) await db.from('profiles').delete().in('id', profileIds);
    record('cleanup', true, 'gallery, media, storage objects, families removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
