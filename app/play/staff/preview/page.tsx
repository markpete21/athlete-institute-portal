import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';
import { staffSelfView, type Staff } from '@/lib/staff/staff';
import { StaffSelfViewBody } from '@/components/play/StaffSelfViewBody';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Coach view preview — Play' };

/**
 * Admin preview of a coach's self-view: exactly what /staff renders for them
 * when signed in, with self-service actions disabled. Staff-only in
 * production; open in local dev so the page can be demoed without a linked
 * coach session. Capabilities preview as a typical Coach role (roster names
 * + schedule + score entry) unless the coach has real roles of their own.
 */
export default async function StaffSelfViewPreviewPage({ searchParams }: { searchParams: { staff?: string } }) {
  if (process.env.NODE_ENV === 'production') {
    const session = await getPortalSession();
    if (!session.isStaff) notFound();
  }

  const db = supabaseAdmin();
  const id = Number(searchParams.staff) || 0;
  let staff: Staff | null = null;
  if (id) {
    const { data } = await db.from('staff').select('id, profile_id, first_name, last_name, email, phone, bio, photo_url, status, employment').eq('id', id).maybeSingle();
    staff = data as Staff | null;
  } else {
    // Default to the most recent coach who actually has an active assignment.
    const { data: recent } = await db
      .from('staff_assignments')
      .select('staff(id, profile_id, first_name, last_name, email, phone, bio, photo_url, status, employment)')
      .eq('active', true)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    staff = (recent?.staff as unknown as Staff | null) ?? null;
  }
  if (!staff) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-4xl">Coach view preview<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">No staff record to preview — add a coach (or pass ?staff=&lt;id&gt;).</p>
        <Link href="/account" className="btn-ghost btn-sm self-start">← My account</Link>
      </main>
    );
  }

  // Real capabilities when the coach has them; otherwise (no linked login,
  // or a login with no roles granted yet) preview as a typical Coach so the
  // page shows what it's built to show.
  let view = await staffSelfView(staff);
  if (Object.keys(view.caps).length === 0) {
    view = await staffSelfView(staff, {
      capsOverride: { roster_names: { view: true, edit: false }, schedule: { view: true, edit: false }, score_entry: { view: true, edit: true } },
    });
  }
  return <StaffSelfViewBody staff={staff} {...view} preview />;
}
