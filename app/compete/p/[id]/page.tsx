import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ProgramLandingPage from '@/components/compete/ProgramLandingPage';
import { programLanding } from '@/lib/compete/compete';

export const dynamic = 'force-dynamic';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const landing = await programLanding(Number(params.id));
  if (!landing) return {};
  return { title: `${landing.name} — Compete. Athlete Institute` };
}

/** Compete's league front door: the shared component with Compete's paths. */
export default async function CompeteProgramLandingPage({ params }: { params: { id: string } }) {
  const landing = await programLanding(Number(params.id));
  if (!landing) notFound();
  return <ProgramLandingPage landing={landing} divisionHref={(id) => `/${id}`} indexHref="/" indexLabel="All divisions" registerHref={`${PLAY_URL}/programs`} registerLabel="Register on Play. App ↗" />;
}
