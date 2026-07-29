import { redirect } from 'next/navigation';

/** Moved to Compete. Portal — same division, public host. */
export default function LeagueMoved({ params }: { params: { id: string } }) {
  const base = process.env.NEXT_PUBLIC_COMPETE_URL ?? 'https://compete.athleteinstitute.ca';
  redirect(`${base}/${params.id}`);
}
