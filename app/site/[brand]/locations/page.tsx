import SitePage, { generateMetadata as gm } from '../[...slug]/page';

export const dynamic = 'force-dynamic';

/** /locations is the finder template (see the catch-all); a fixed route keeps it above custom pages. */
export const generateMetadata = ({ params }: { params: { brand: string } }) => gm({ params: { brand: params.brand, slug: ['locations'] } });

export default function LocationsPage({ params, searchParams }: { params: { brand: string }; searchParams: { preview?: string; sport?: string } }) {
  return SitePage({ params: { brand: params.brand, slug: ['locations'] }, searchParams });
}
