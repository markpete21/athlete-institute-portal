import { notFound } from 'next/navigation';
import { getPostAdmin } from '@/lib/site/posts';
import { listLocations, listPrograms } from '@/lib/site/records';
import { listMedia } from '@/lib/site/media';
import { getSiteSession } from '@/lib/site/editor-session';
import { canPublish, siteRoleFor } from '@/lib/site/scopes';
import { StoryEditor } from './StoryEditor';

export const dynamic = 'force-dynamic';

/** Story editor (ALL CAN §6.7): one story, draft with Claude, publish now or schedule. */
export default async function StoryPage({ params }: { params: { brand: string; id: string } }) {
  const brand = params.brand;
  const role = await siteRoleFor(await getSiteSession(brand), brand);
  if (!role) notFound();
  const post = params.id === 'new' ? null : await getPostAdmin(brand, Number(params.id));
  if (params.id !== 'new' && !post) notFound();
  const [locs, progs, media] = await Promise.all([listLocations(brand), listPrograms(brand), listMedia(brand)]);
  return <StoryEditor brand={brand} post={post} canPublish={canPublish(role)} locations={locs.map((l) => ({ slug: l.slug, name: l.name }))} programs={progs.map((p) => ({ slug: p.slug, name: p.name, locationSlug: p.locationSlug }))} images={media.filter((m) => m.kind === 'photo').map((m) => ({ url: m.url, name: m.name, alt: m.alt ?? '' }))} />;
}
