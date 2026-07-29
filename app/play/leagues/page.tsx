import { redirect } from 'next/navigation';

/**
 * Standings moved to Compete. Portal (its own public host). Keeping a redirect
 * rather than a second copy: two live renderings of the same standings is a
 * maintenance trap, and existing links/bookmarks shouldn't break.
 */
export default function LeaguesMoved() {
  redirect(process.env.NEXT_PUBLIC_COMPETE_URL ?? 'https://compete.athleteinstitute.ca');
}
