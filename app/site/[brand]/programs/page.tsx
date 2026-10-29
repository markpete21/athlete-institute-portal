import { notFound } from 'next/navigation';
import { siteContext } from '@/lib/site/context';
import { getPageBySlug } from '@/lib/site/pages';
import { ProgramsCatalog } from '@/components/site/templates/ProgramsCatalog';

export const dynamic = 'force-dynamic';

export default async function ProgramsPage({ params, searchParams }: { params: { brand: string }; searchParams: { preview?: string } }) {
  const ctx = await siteContext(params.brand, searchParams.preview);
  if (!ctx) notFound();
  const page = await getPageBySlug(params.brand, 'programs');
  return <ProgramsCatalog ctx={{ site: ctx.site, brandKey: ctx.site.brandKey, preview: ctx.preview }} page={page} />;
}
