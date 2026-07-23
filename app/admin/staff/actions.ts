'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { PayFrequency, PayMode } from '@ai/foundation';
import { getPortalSession } from '@/lib/auth';
import {
  addCertification,
  addStaffEmail,
  archiveStaff,
  assignStaffToProgram,
  createStaff,
  recordAbsence,
  setCapability,
  submitUnavailability,
} from '@/lib/staff/staff';

async function requireStaff() {
  const session = await getPortalSession();
  if (!session.isStaff) throw new Error('Staff only.');
  return session;
}
const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? '0')) * 100) || 0;

export async function createStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const s = await createStaff({ firstName: String(formData.get('firstName') ?? ''), lastName: String(formData.get('lastName') ?? ''), email: String(formData.get('email') ?? '').trim() || null, bio: String(formData.get('bio') ?? '').trim() || null }, session.userId!);
  redirect(`/staff/${s.id}`);
}

export async function addEmailAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await addStaffEmail(id, String(formData.get('email') ?? ''), session.userId!);
  revalidatePath(`/staff/${id}`);
}

export async function archiveStaffAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await archiveStaff(id, session.userId!, formData.get('unarchive') !== 'on');
  revalidatePath(`/staff/${id}`);
}

export async function setCapabilityAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  await setCapability(Number(formData.get('roleId')), String(formData.get('capability')), formData.get('view') === 'on', formData.get('edit') === 'on', session.userId!);
  revalidatePath('/staff/permissions');
}

export async function assignAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await assignStaffToProgram({
    staffId,
    programId: Number(formData.get('programId')),
    roleLabel: String(formData.get('roleLabel') ?? '').trim() || null,
    payMode: String(formData.get('payMode') ?? 'per_session') as PayMode,
    rateCents: cents(formData.get('rate')),
    frequency: String(formData.get('frequency') ?? 'after_program') as PayFrequency,
    units: formData.get('units') ? Number(formData.get('units')) : undefined,
    programStartISO: String(formData.get('startDate')),
    programEndISO: String(formData.get('endDate')),
  }, session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function addCertAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = Number(formData.get('staffId'));
  await addCertification({ staffId: id, name: String(formData.get('name') ?? ''), expiresOn: String(formData.get('expiresOn') ?? '') || null }, session.userId!);
  revalidatePath(`/staff/${id}`);
}

export async function absenceAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const staffId = Number(formData.get('staffId'));
  await recordAbsence({ assignmentId: Number(formData.get('assignmentId')), sessionDateISO: String(formData.get('sessionDate')), replacementStaffId: formData.get('replacementStaffId') ? Number(formData.get('replacementStaffId')) : null, replacementRateCents: formData.get('replacementRate') ? cents(formData.get('replacementRate')) : null }, session.userId!);
  revalidatePath(`/staff/${staffId}`);
}

export async function markPayPaidAction(formData: FormData): Promise<void> {
  await requireStaff();
  const { supabaseAdmin } = await import('@ai/foundation/supabase');
  await supabaseAdmin().from('staff_pay_dates').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', Number(formData.get('payDateId')));
  revalidatePath('/staff/pay');
}

export async function submitUnavailabilityAction(formData: FormData): Promise<void> {
  await requireStaff();
  await submitUnavailability(Number(formData.get('staffId')), String(formData.get('date')), String(formData.get('note') ?? '').trim() || null);
  revalidatePath('/staff/me');
}
