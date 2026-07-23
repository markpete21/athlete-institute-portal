'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { createDisplay, deleteDisplay, upsertTemplate } from '@/lib/displays';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function saveTemplateAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Template name required.');
  await upsertTemplate(
    {
      name,
      media_mode: String(formData.get('mediaMode') ?? 'image') as 'image' | 'video' | 'slideshow',
      media_urls: String(formData.get('mediaUrls') ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      show_today: formData.get('showToday') === 'on',
      show_upcoming: formData.get('showUpcoming') === 'on',
      slide_seconds: Math.max(3, Math.min(120, Number(formData.get('slideSeconds')) || 8)),
    },
    session.userId!,
  );
  revalidatePath('/displays');
}

export async function createDisplayAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Display name required.');
  const templateRaw = String(formData.get('templateId') ?? '');
  const facilityIds = String(formData.get('facilityIds') ?? '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  await createDisplay(
    { name, templateId: templateRaw ? Number(templateRaw) : null, facilityIds },
    session.userId!,
  );
  revalidatePath('/displays');
}

export async function deleteDisplayAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await deleteDisplay(Number(formData.get('displayId')), session.userId!);
  revalidatePath('/displays');
}
