'use server';

import { revalidatePath } from 'next/cache';
import { getPortalSession } from '@/lib/auth';
import { commitImportJob, createImportJob, resolveRow, sendClaimEmails } from '@/lib/import/playbook';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}

export async function uploadCsvAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const file = formData.get('csv') as File | null;
  if (!file || file.size === 0) throw new Error('Choose a CSV file first.');
  if (file.size > 10 * 1024 * 1024) throw new Error('CSV too large (10MB max).');
  const text = await file.text();
  await createImportJob(file.name, text, session.userId!);
  revalidatePath('/import');
}

export async function resolveRowAction(formData: FormData): Promise<void> {
  await requireStaff();
  const rowId = Number(formData.get('rowId'));
  const resolution = String(formData.get('resolution')) as 'new' | 'merge' | 'skip';
  const mergeInto = formData.get('mergeInto') ? Number(formData.get('mergeInto')) : undefined;
  await resolveRow(rowId, resolution, mergeInto);
  revalidatePath('/import');
}

export async function commitJobAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const jobId = Number(formData.get('jobId'));
  const appUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  await commitImportJob(jobId, session.userId!, appUrl);
  revalidatePath('/import');
}

export async function sendClaimEmailsAction(formData: FormData): Promise<void> {
  await requireStaff();
  const jobId = Number(formData.get('jobId'));
  const appUrl = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
  await sendClaimEmails(jobId, appUrl);
  revalidatePath('/import');
}
