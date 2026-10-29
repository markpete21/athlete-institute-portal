import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth';
import { toggleFollow } from '@/lib/site/follows';

export const dynamic = 'force-dynamic';

/** Follow / unfollow a team (form POST from the division page). Signed-in only; redirects back. */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const teamId = Number(fd.get('teamId'));
  const back = new URL(String(fd.get('back') ?? req.headers.get('referer') ?? '/'), req.url);
  let session: Awaited<ReturnType<typeof getPortalSession>> | null = null;
  try { session = await getPortalSession(); } catch { session = null; }
  if (!session?.profileId) {
    const play = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';
    return NextResponse.redirect(`${play}/sign-in?redirect_url=${encodeURIComponent(back.toString())}`, 303);
  }
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  const { following } = await toggleFollow(session.profileId, teamId);
  if ((req.headers.get('accept') ?? '').includes('application/json')) return NextResponse.json({ following });
  back.hash = 'rosters';
  return NextResponse.redirect(back, 303);
}
