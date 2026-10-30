import { navTree } from '@/lib/site/nav';
import { listPages } from '@/lib/site/pages';
import { listMedia } from '@/lib/site/media';
import { NavEditor } from './NavEditor';

export const dynamic = 'force-dynamic';

/** Menu editor (ALL CAN §6.4): the public menu as a tree; drag to reorder, folders in grey, two levels max. */
export default async function NavPage({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  const [tree, pages, media] = await Promise.all([navTree(brand), listPages(brand), listMedia(brand)]);
  return <NavEditor brand={brand} tree={tree} pages={pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug, state: p.state }))} images={media.filter((m) => m.kind === 'photo').map((m) => ({ url: m.url, name: m.name }))} />;
}
