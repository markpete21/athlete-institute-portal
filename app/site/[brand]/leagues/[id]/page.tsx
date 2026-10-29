import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProgramLandingPage from '@/components/compete/ProgramLandingPage';
import { siteContext } from '@/lib/site/context';
import { programLanding } from '@/lib/compete/compete';
import { supabaseAdmin } from '@ai/foundation/supabase';

export const dynamic = 'force-dynamic';

async function brandOf(programId: number): Promise<string | null> {
  const { data } = await supabaseAdmin().from('programs').select('brand_key').eq('id', programId).maybeSingle();
  return data?.brand_key ?? null;
}

export async function generateMetadata({ params }: { params: { brand: string; id: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const landing = await programLanding(Number(params.id));
  if (!ctx || !landing) return {};
  return { title: { absolute: `${landing.name} · ${ctx.site.name}` }, alternates: { canonical: `${ctx.origin}/leagues/${landing.programId}` } };
}

/** A league's front door on the brand site (shared Compete component). */
export default async function SiteLeaguePage({ params }: { params: { brand: string; id: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  const id = Number(params.id);
  const [landing, brand] = await Promise.all([programLanding(id), brandOf(id)]);
  if (!landing || (brand && brand !== params.brand)) notFound();
  return <div className="wrap site-compete"><ProgramLandingPage landing={landing} divisionHref={(d) => `/standings/${d}`} indexHref="/standings" indexLabel="All divisions" registerHref={null} /></div>;
}
