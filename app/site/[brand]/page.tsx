import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlockRenderer from '@/components/site/blocks/BlockRenderer';
import { siteContext } from '@/lib/site/context';
import { getPageBySlug } from '@/lib/site/pages';
import { pageDescription, pageTitle } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

/** Home: the home page's blocks (hero, why band, partners, locations, big buttons on ALL CAN). */
export async function generateMetadata({ params }: { params: { brand: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const page = ctx && (await getPageBySlug(params.brand, ''));
  if (!ctx || !page) return {};
  return { title: { absolute: pageTitle(ctx.site, page) }, description: pageDescription(ctx.site, page), alternates: { canonical: ctx.origin } };
}

export default async function SiteHome({ params, searchParams }: { params: { brand: string }; searchParams: { preview?: string } }) {
  const ctx = await siteContext(params.brand, searchParams.preview);
  if (!ctx) notFound();
  const page = await getPageBySlug(params.brand, '');
  if (!page) notFound();
  const blocks = ctx.preview ? page.blocksDraft : page.blocksPublished ?? [];
  return <BlockRenderer blocks={blocks} ctx={{ site: ctx.site, brandKey: ctx.site.brandKey, preview: ctx.preview }} />;
}
