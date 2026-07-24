'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { addPhoto, addVideo, archiveOldGalleries, createGallery, notifyNewMedia } from '@/lib/gallery/gallery';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function createGalleryAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await createGallery({ programId: Number(formData.get('programId')), title: String(formData.get('title') ?? 'Gallery') }, s.userId!);
  revalidatePath('/gallery');
}

export async function uploadPhotosAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const galleryId = Number(formData.get('galleryId'));
  const files = formData.getAll('photos') as File[];
  for (const f of files) {
    if (!f || f.size === 0) continue;
    await addPhoto(galleryId, { name: f.name, body: Buffer.from(await f.arrayBuffer()), contentType: f.type || 'image/jpeg' }, s.userId!);
  }
  if (formData.get('notify') === 'on') await notifyNewMedia(galleryId);
  revalidatePath('/gallery');
}

export async function addVideoAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const galleryId = Number(formData.get('galleryId'));
  await addVideo(galleryId, { streamRef: String(formData.get('streamRef')), caption: String(formData.get('caption') ?? '') || null }, s.userId!);
  if (formData.get('notify') === 'on') await notifyNewMedia(galleryId);
  revalidatePath('/gallery');
}

export async function archiveAction(): Promise<void> {
  await requireStaff();
  await archiveOldGalleries(6);
  revalidatePath('/gallery');
}
