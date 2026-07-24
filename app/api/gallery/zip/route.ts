import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth';
import { downloadUrls, familyCanSee } from '@/lib/gallery/gallery';
import { buildZip } from '@/lib/gallery/zip';

export const dynamic = 'force-dynamic';

/**
 * Multi-select zip download (Module 17). Enrollment-scoped: only a family
 * enrolled in the gallery's program (or staff) may download. Full-res originals
 * are fetched server-side via signed URLs and streamed back as one zip.
 */
export async function POST(req: NextRequest) {
  const session = await getPortalSession();
  if (!session.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { galleryId, mediaIds } = (await req.json()) as { galleryId: number; mediaIds: number[] };
  if (!galleryId || !Array.isArray(mediaIds) || mediaIds.length === 0) {
    return NextResponse.json({ error: 'galleryId + mediaIds required' }, { status: 400 });
  }

  if (!session.isStaff) {
    if (!session.familyId || !(await familyCanSee(galleryId, session.familyId))) {
      return NextResponse.json({ error: 'Not enrolled in this program' }, { status: 403 });
    }
  }

  const urls = await downloadUrls(mediaIds.slice(0, 100));
  const files: Array<{ name: string; data: Uint8Array }> = [];
  for (const u of urls) {
    const res = await fetch(u.url, { cache: 'no-store' });
    if (res.ok) files.push({ name: u.name, data: new Uint8Array(await res.arrayBuffer()) });
  }
  if (files.length === 0) return NextResponse.json({ error: 'No downloadable media' }, { status: 404 });

  const zip = buildZip(files);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="gallery-${galleryId}.zip"`,
    },
  });
}
