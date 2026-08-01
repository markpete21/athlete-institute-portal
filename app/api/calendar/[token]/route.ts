import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { buildICS, getFeedByToken, type FeedEvent } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC ICS feed - the unguessable token is the credential (same model as
 * the TV display URLs). Calendar apps poll this on their own schedule.
 * Window: 30 days back, 180 days forward.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const feed = await getFeedByToken(params.token);
  if (!feed) return new NextResponse('Not found', { status: 404 });

  const db = supabaseAdmin();
  const from = new Date(Date.now() - 30 * 86400_000).toISOString();
  const to = new Date(Date.now() + 180 * 86400_000).toISOString();

  let q = db
    .from('bookings')
    .select('id, title, starts_at, ends_at, status, facility_id, family_id')
    .is('canceled_at', null)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at')
    .limit(1000);
  if (feed.kind === 'family') q = q.eq('family_id', feed.family_id!);

  const [{ data: bookings, error }, { data: facRows }] = await Promise.all([
    q,
    db.from('facilities').select('id, name').is('deleted_at', null),
  ]);
  if (error) return new NextResponse('Feed error', { status: 500 });
  const facName = new Map((facRows ?? []).map((f) => [f.id, f.name]));

  const events: FeedEvent[] = (bookings ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    status: b.status as FeedEvent['status'],
    facilityName: facName.get(b.facility_id) ?? 'Athlete Institute',
  }));

  const name = feed.kind === 'master' ? 'Athlete Institute — Master Schedule' : 'Athlete Institute — Family Schedule';
  return new NextResponse(buildICS(name, events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="athlete-institute.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
