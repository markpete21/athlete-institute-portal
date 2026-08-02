/**
 * Media / file storage (Module 0 §7) — server-only, import from
 * '@ai/foundation/storage'.
 *
 * Buckets are private by default: access goes through signed URLs minted by
 * server code that has already applied its own authorization (Clerk session +
 * role checks). The two exceptions are listed in PUBLIC_BUCKETS below — assets
 * that must render for anonymous visitors or on unattended display boards.
 */

import { supabaseAdmin } from './supabase';

export const BUCKETS = {
  /** Staff bios/photos (Module 5). */
  staffPhotos: 'staff-photos',
  /** Event/program logos (Modules 2/4/6). PUBLIC — these render on the TV
      display boards, which live at unauthenticated token URLs and stay up for
      weeks, so a signed URL would expire mid-run and break the image. */
  eventLogos: 'event-logos',
  /** TV-display media (Module 2 /display screens). */
  displayMedia: 'display-media',
  /** Product images — jerseys, merch (Module 4). */
  productImages: 'product-images',
  /** Documents: quotes, jersey orders, waiver PDFs (Modules 3/4). */
  documents: 'documents',
  /** Program/session photo galleries (Module 17). Video streams via the live pipeline. */
  galleryMedia: 'gallery-media',
  /** Brand logos/wordmarks. PUBLIC — these render in the public header for
      anonymous visitors, so they cannot sit behind signed URLs. */
  brandAssets: 'brand-assets',
  /** Family-member photos (parent-uploaded). PRIVATE — children's photos are
      never public; the portal serves them through short-lived signed URLs. */
  memberPhotos: 'member-photos',
} as const;

export type BucketKey = keyof typeof BUCKETS;
export type BucketName = (typeof BUCKETS)[BucketKey];

const IMAGE_BUCKETS: BucketName[] = ['staff-photos', 'event-logos', 'display-media', 'product-images', 'gallery-media', 'brand-assets', 'member-photos'];

/** Buckets served publicly (no signed URL). Everything else stays private. */
const PUBLIC_BUCKETS: BucketName[] = ['brand-assets', 'event-logos'];

/**
 * Idempotently create every bucket, and reconcile the public/private flag on
 * ones that already exist. The reconcile step matters: a bucket created before
 * it joined PUBLIC_BUCKETS keeps its old visibility forever otherwise, which
 * is exactly how event-logos ended up private while the TV boards tried to
 * render its objects over plain HTTP. Safe to re-run.
 */
export async function ensureBuckets(): Promise<{
  created: string[];
  existing: string[];
  revisibled: string[];
}> {
  const storage = supabaseAdmin().storage;
  const { data: existing, error } = await storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  const have = new Map((existing ?? []).map((b) => [b.name, b]));

  const created: string[] = [];
  const revisibled: string[] = [];
  for (const name of Object.values(BUCKETS)) {
    const wantPublic = PUBLIC_BUCKETS.includes(name);
    const isImage = IMAGE_BUCKETS.includes(name);
    const current = have.get(name);

    if (current) {
      if (current.public !== wantPublic) {
        const { error: upErr } = await storage.updateBucket(name, { public: wantPublic });
        if (upErr) throw new Error(`updateBucket(${name}) failed: ${upErr.message}`);
        revisibled.push(`${name}->${wantPublic ? 'public' : 'private'}`);
      }
      continue;
    }

    const { error: createErr } = await storage.createBucket(name, {
      public: wantPublic,
      fileSizeLimit: isImage ? '10MB' : '25MB',
      allowedMimeTypes: isImage
        ? ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif', 'video/mp4']
        : undefined, // documents: PDFs, spreadsheets, etc. — validated at the call site
    });
    if (createErr) throw new Error(`createBucket(${name}) failed: ${createErr.message}`);
    created.push(name);
  }
  return { created, existing: [...have.keys()], revisibled };
}

/**
 * Upload a file. Caller has already authorized the actor; `path` convention is
 * `<entity>/<id>/<filename>` (e.g. `staff/123/headshot.jpg`) per the schema
 * conventions doc.
 */
export async function uploadFile(
  bucket: BucketName,
  path: string,
  body: Blob | ArrayBuffer | Buffer,
  opts?: { contentType?: string; upsert?: boolean },
): Promise<{ path: string }> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, body, { contentType: opts?.contentType, upsert: opts?.upsert ?? false });
  if (error) throw new Error(`upload(${bucket}/${path}) failed: ${error.message}`);
  return { path: data.path };
}

/** Mint a time-limited signed URL for a private object. Default 1 hour. */
export async function getSignedUrl(
  bucket: BucketName,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(`signedUrl(${bucket}/${path}) failed: ${error.message}`);
  return data.signedUrl;
}

/**
 * Signed URL for a RESIZED rendition (Supabase image transform / CDN). Browse
 * views must use this - full-res originals are served only on explicit
 * download (Module 17 cost control).
 */
export async function getSignedThumbUrl(
  bucket: BucketName,
  path: string,
  width = 480,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds, { transform: { width, resize: 'contain' } });
  if (error) throw new Error(`signedThumbUrl(${bucket}/${path}) failed: ${error.message}`);
  return data.signedUrl;
}

export async function deleteFile(bucket: BucketName, paths: string[]): Promise<void> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).remove(paths);
  if (error) throw new Error(`delete(${bucket}) failed: ${error.message}`);
  // remove() reports success even when nothing matched — verify the count so a
  // silent no-op (wrong path, permission quirk) surfaces as an error.
  if ((data?.length ?? 0) !== paths.length) {
    throw new Error(
      `delete(${bucket}) removed ${data?.length ?? 0} of ${paths.length} objects (check paths: ${paths.join(', ')})`,
    );
  }
}


/**
 * Public URL for an object in a PUBLIC bucket (currently brand-assets only).
 * Throws for private buckets — those must use getSignedUrl() instead, so a
 * private asset can never be leaked through the wrong helper.
 */
export function getPublicUrl(bucket: BucketName, path: string): string {
  if (!PUBLIC_BUCKETS.includes(bucket)) {
    throw new Error(`getPublicUrl(): ${bucket} is private — use getSignedUrl().`);
  }
  const { data } = supabaseAdmin().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
