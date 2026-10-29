import { notFound } from 'next/navigation';
import { siteContext } from '@/lib/site/context';
import { ProgramDetail } from '@/components/site/templates/ProgramsCatalog';

export const dynamic = 'force-dynamic';

export default async function ProgramPage({ params, searchParams }: { params: { brand: string; id: string }; searchParams: { preview?: string } }) {
  const ctx = await siteContext(params.brand, searchParams.preview);
  if (!ctx) notFound();
  const el = await ProgramDetail({ ctx: { site: ctx.site, brandKey: ctx.site.brandKey, preview: ctx.preview }, id: Number(params.id) });
  if (!el) notFound();
  return el;
}
