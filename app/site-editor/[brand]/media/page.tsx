import { listMedia, mediaUsage, needsAlt } from '@/lib/site/media';
import { MediaLibrary } from './MediaLibrary';

export const dynamic = 'force-dynamic';

/** Media library (ALL CAN §6.8): upload, folders, alt text (required for photos), replace everywhere, usage, delete. */
export default async function MediaPage({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  const [media, usage] = await Promise.all([listMedia(brand), mediaUsage(brand)]);
  const items = media.map((m) => ({ ...m, usedOn: usage.get(m.url) ?? [], missingAlt: needsAlt(m) }));
  return <MediaLibrary brand={brand} items={items} folders={[...new Set(['Photos', 'Logos', 'Partners', 'Sports', 'Documents', 'Uploads', ...media.map((m) => m.folder)])]} />;
}
