'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { removeBrandLogo, updateBrand, uploadBrandLogo } from '@/lib/brands/brands';

async function requireStaff() {
  const s = await getPortalSession();
  if (!s.isStaff) throw new Error('Staff only.');
  return s;
}

export async function uploadLogoAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  const key = String(formData.get('key'));
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a logo file to upload.');
  await uploadBrandLogo({ key, file, actorClerkId: s.userId! });
  revalidatePath('/brands');
  revalidatePath('/', 'layout');
}

export async function removeLogoAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await removeBrandLogo(String(formData.get('key')), s.userId!);
  revalidatePath('/brands');
  revalidatePath('/', 'layout');
}

export async function updateBrandAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  await updateBrand({
    key: String(formData.get('key')),
    name: String(formData.get('name') ?? '') || undefined,
    accent: String(formData.get('accent') ?? '') || undefined,
    tagline: String(formData.get('tagline') ?? ''),
    sortOrder: formData.get('sortOrder') ? Number(formData.get('sortOrder')) : undefined,
    showInHeader: formData.get('showInHeader') === 'on',
    actorClerkId: s.userId!,
  });
  revalidatePath('/brands');
  revalidatePath('/', 'layout');
}
