import { NextRequest, NextResponse } from 'next/server';
import { jsonError, readJson } from '@/lib/api/handlers';
import { getPortalSession } from '@/lib/auth';
import { downloadUrls, familyCanSee } from '@/lib/gallery/gallery';
import { buildZip } from '@/lib/gallery/zip';

export const dynamic = 'force-dynamic';

/** Zip is assembled in memory: keep it well inside the serverless response budget. */
const MAX_FILES = 25;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

/**
 * Multi-select zip download (Module 17). Enrollment-scoped: only a family
 * enrolled in the gallery's program (or staff) may download. Full-res originals
 * are fetched server-side via signed URLs and streamed back as one zip.
 */
export async function POST(req: NextRequest) {
  const session = await getPortalSession();
  if (!session.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = await readJson<{ galleryId?: unknown; mediaIds?: unknown }>(req);
  const galleryId = Number(body?.galleryId);
  const mediaIds = Array.isArray(body?.mediaIds) ? body.mediaIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!Number.isInteger(galleryId) || galleryId <= 0 || mediaIds.length === 0) {
    return jsonError('galleryId + mediaIds required', 400);
  }

  if (!session.isStaff) {
    if (!session.familyId || !(await familyCanSee(galleryId, session.familyId))) {
      return NextResponse.json({ error: 'Not enrolled in this program' }, { status: 403 });
    }
  }

  const urls = await downloadUrls(galleryId, mediaIds.slice(0, MAX_FILES));
  const files: Array<{ name: string; data: Uint8Array }> = [];
  let total = 0;
  const fetched = await Promise.all(urls.map(async (u) => {
    const res = await fetch(u.url, { cache: 'no-store' });
    return res.ok ? { name: u.name, data: new Uint8Array(await res.arrayBuffer()) } : null;
  }));
  for (const f of fetched) {
    if (!f) continue;
    if (total + f.data.byteLength > MAX_TOTAL_BYTES) break;
    total += f.data.byteLength;
    files.push(f);
  }
  if (files.length === 0) return jsonError('No downloadable media', 404);

  const zip = buildZip(files);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="gallery-${galleryId}.zip"`,
    },
  });
}
