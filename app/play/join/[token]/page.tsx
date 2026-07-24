import Link from 'next/link';
import { notFound } from 'next/navigation';
import { joinLinkOpen } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { getPortalSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Public captain join-link landing (Module 7). Validates the link (expiry +
 * max players) and routes a signed-in family into that team's registration.
 * The actual member-join runs server-side via lib/leagues.memberJoin.
 */
export default async function JoinTeamPage({ params }: { params: { token: string } }) {
  const db = supabaseAdmin();
  const { data: team } = await db
    .from('teams')
    .select('id, name, join_expires_at, divisions(name, max_players, programs(name))')
    .eq('join_token', params.token)
    .maybeSingle();
  if (!team) notFound();

  const div = team.divisions as unknown as { name: string; max_players: number | null; programs: { name: string } };
  const { count } = await db.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
  const status = joinLinkOpen({ expiresAtISO: team.join_expires_at, memberCount: count ?? 0, maxPlayers: div.max_players, nowISO: new Date().toISOString() });
  const session = await getPortalSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 px-6">
      <p className="label text-[11px]">{div.programs.name} · {div.name}</p>
      <h1 className="text-4xl">Join {team.name}<span style={{ color: 'var(--accent)' }}>.</span></h1>

      {!status.open ? (
        <div className="card p-6">
          <p className="text-body">{status.reason === 'full' ? 'This team is full.' : 'This join link has expired.'} Please contact the organizer.</p>
        </div>
      ) : !session.userId ? (
        <div className="card p-6">
          <p className="text-body">You&apos;ve been invited to join <strong>{team.name}</strong>. <Link href="/sign-in" className="text-gold">Sign in</Link> to register a family member onto this team.</p>
        </div>
      ) : (
        <div className="card flex flex-col gap-3 p-6">
          <p className="text-body">Register a family member onto <strong>{team.name}</strong> ({count} joined so far).</p>
          <Link href={`/account?join=${params.token}`} className="btn-gold self-start">Choose who to register</Link>
          <p className="text-xs text-silver">The member-select + waiver + payment flow completes in your account (Module 4).</p>
        </div>
      )}
    </main>
  );
}
