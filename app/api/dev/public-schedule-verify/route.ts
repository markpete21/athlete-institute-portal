import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createBooking } from '@/lib/bookings';
import { listBookings } from '@/lib/bookings';

/**
 * DEV-ONLY: Stage-7 public + family schedule - curated public page hides
 * rentals/internal (HTTP fetch of /schedule), family_id linkage queryable,
 * defaults per source. Cleaned up.
 */
export async function GET(req: NextRequest) {
  const base = `http://localhost:${req.nextUrl.port || 3000}`;
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const made: number[] = [];
  let familyId: number | null = null;
  let profileId: number | null = null;
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const at = (h: number) => `${tomorrow}T${String(h).padStart(2, '0')}:00:00-04:00`;

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const idOf = (name: string) => fac!.find((f) => f.name === name)!.id;

    // Synthetic family
    const { data: prof } = await db.from('profiles').insert({ clerk_user_id: `sched_${Date.now()}`, email: `sched_${Date.now()}@example.test` }).select('id').single();
    profileId = prof!.id;
    const { data: fam } = await db.from('families').insert({ name: 'Schedule Verify', hoh_profile_id: profileId }).select('id').single();
    familyId = fam!.id;

    // Bookings: public program; private rental; internal; family-linked rental (private)
    const pub = await createBooking({ facilityId: idOf('Dome Court 1'), startsAt: at(18), endsAt: at(19), source: 'program', title: 'Public Program XYZ', actorClerkId: 'system:verify' });
    const rental = await createBooking({ facilityId: idOf('Dome Court 2'), startsAt: at(18), endsAt: at(19), source: 'rental', title: 'Hidden Rental ABC', actorClerkId: 'system:verify' });
    const internal = await createBooking({ facilityId: idOf('Dome Court 3'), startsAt: at(18), endsAt: at(19), source: 'internal', title: 'Internal Ops QRS', actorClerkId: 'system:verify' });
    const famBk = await createBooking({ facilityId: idOf('Fieldhouse North'), startsAt: at(9), endsAt: at(10), source: 'rental', title: 'Family Court Time', familyId, actorClerkId: 'system:verify' });
    made.push(pub.booking.id, rental.booking.id, internal.booking.id, famBk.booking.id);

    // 1. public defaults per source
    record(
      'public flag defaults (program ON, rental/internal OFF)',
      pub.booking.show_on_public_schedule && !rental.booking.show_on_public_schedule && !internal.booking.show_on_public_schedule,
      'ok',
    );

    // 2. the public page (unauthenticated HTTP) shows the program, hides the rest
    const res = await fetch(`${base}/schedule`, { headers: { Host: 'play.athleteinstitute.ca' }, cache: 'no-store' });
    const html = await res.text();
    record(
      'public page curated',
      res.status === 200 && html.includes('Public Program XYZ') && !html.includes('Hidden Rental ABC') && !html.includes('Internal Ops QRS') && !html.includes('Family Court Time'),
      `HTTP ${res.status}`,
    );

    // 3. family linkage queryable (the signed-in page section uses this exact filter)
    const famList = await listBookings({ from: `${tomorrow}T00:00:00Z`, to: `${tomorrow}T23:59:59Z`, familyId: familyId! });
    record(
      'family_id linkage',
      famList.length === 1 && famList[0].title === 'Family Court Time',
      famList.map((b) => b.title).join(', '),
    );
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (made.length) await db.from('bookings').delete().in('id', made);
    if (familyId) await db.from('families').delete().eq('id', familyId);
    if (profileId) await db.from('profiles').delete().eq('id', profileId);
    record('cleanup', true, 'synthetic rows removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
