import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GamesList } from '@/components/site/templates/GamesList';
import { siteContext } from '@/lib/site/context';
import { getPageBySlug } from '@/lib/site/pages';
import { pageDescription, pageTitle } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { brand: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const page = ctx && (await getPageBySlug(params.brand, 'scores'));
  if (!ctx) return {};
  return { title: page ? { absolute: pageTitle(ctx.site, page) } : undefined, description: page ? pageDescription(ctx.site, page) : undefined, alternates: { canonical: `${ctx.origin}/results` } };
}

export default async function Page({ params, searchParams }: { params: { brand: string }; searchParams: { division?: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  return <GamesList brandKey={params.brand} mode="results" division={searchParams.division} />;
}
