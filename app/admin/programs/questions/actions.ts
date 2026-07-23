'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { createQuestion, setMarketingSourceOptions, updateQuestion, type QType } from '@/lib/programs/questions';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

const parseOptions = (v: FormDataEntryValue | null): string[] =>
  String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

export async function createQuestionAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await createQuestion(
    {
      label: String(formData.get('label') ?? ''),
      qtype: String(formData.get('qtype') ?? 'short_text') as QType,
      helpText: String(formData.get('helpText') ?? '').trim() || null,
      options: parseOptions(formData.get('options')),
      required: formData.get('required') === 'on',
      defaultForTypeId: formData.get('defaultForTypeId') ? Number(formData.get('defaultForTypeId')) : null,
    },
    session.userId!,
  );
  revalidatePath('/programs/questions');
}

export async function updateQuestionAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('id'));
  await updateQuestion(
    id,
    {
      label: String(formData.get('label') ?? '').trim(),
      help_text: String(formData.get('helpText') ?? '').trim() || null,
      options: parseOptions(formData.get('options')),
      required: formData.get('required') === 'on',
      default_for_type_id: formData.get('defaultForTypeId') ? Number(formData.get('defaultForTypeId')) : null,
      archived: formData.get('archived') === 'on',
    },
    session.userId!,
  );
  revalidatePath('/programs/questions');
}

export async function saveMarketingSourcesAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await setMarketingSourceOptions(parseOptions(formData.get('options')), session.userId!);
  revalidatePath('/programs/questions');
}
