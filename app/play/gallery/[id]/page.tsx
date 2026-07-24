import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { browseGallery, familyCanSee } from '@/lib/gallery/gallery';
import GalleryGrid from './grid';

export const dynamic = 'force-dynamic';

/**
 * Family gallery browse (Module 17), mobile-first. Thumbnails/posters only in
 * browse; originals only on explicit download; video streams via the live
 * pipeline. Strictly enrollment-scoped.
 */
export default async function GalleryPage({ params }: { params: { id: string } }) {
  const galleryId = Number(params.id);
  const session = await getPortalSession();
  if (!session.userId) notFound();
  if (!session.isStaff && (!session.familyId || !(await familyCanSee(galleryId, session.familyId)))) notFound();

  const { data: gallery } = await supabaseAdmin().from('galleries').select('title, programs(name)').eq('id', galleryId).maybeSingle();
  if (!gallery) notFound();
  const media = await browseGallery(galleryId);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">{(gallery.programs as unknown as { name: string } | null)?.name}</p>
        <h1 className="text-3xl">{gallery.title}<span style={{ color: 'var(--accent)' }}>.</span></h1>
      </header>
      <GalleryGrid galleryId={galleryId} media={media} />
    </main>
  );
}
