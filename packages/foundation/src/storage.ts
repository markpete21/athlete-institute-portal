/**
 * Media / file storage (Module 0 §7) — server-only, import from
 * '@ai/foundation/storage'.
 *
 * Five private buckets; ALL access goes through signed URLs minted by server
 * code that has already applied its own authorization (Clerk session + role
 * checks). Nothing is publicly listable.
 */

import { supabaseAdmin } from './supabase';

export const BUCKETS = {
  /** Staff bios/photos (Module 5). */
  staffPhotos: 'staff-photos',
  /** Event/program logos (Modules 2/4/6). */
  eventLogos: 'event-logos',
  /** TV-display media (Module 2 /display screens). */
  displayMedia: 'display-media',
  /** Product images — jerseys, merch (Module 4). */
  productImages: 'product-images',
  /** Documents: quotes, jersey orders, waiver PDFs (Modules 3/4). */
  documents: 'documents',
} as const;

export type BucketKey = keyof typeof BUCKETS;
export type BucketName = (typeof BUCKETS)[BucketKey];

const IMAGE_BUCKETS: BucketName[] = ['staff-photos', 'event-logos', 'display-media', 'product-images'];

/**
 * Idempotently create every bucket (private). Call from a setup script or the
 * dev verify route; safe to re-run — existing buckets are left untouched.
 */
export async function ensureBuckets(): Promise<{ created: string[]; existing: string[] }> {
  const storage = supabaseAdmin().storage;
  const { data: existing, error } = await storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  const have = new Set((existing ?? []).map((b) => b.name));

  const created: string[] = [];
  for (const name of Object.values(BUCKETS)) {
    if (have.has(name)) continue;
    const isImage = IMAGE_BUCKETS.includes(name);
    const { error: createErr } = await storage.createBucket(name, {
      public: false,
      fileSizeLimit: isImage ? '10MB' : '25MB',
      allowedMimeTypes: isImage
        ? ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif', 'video/mp4']
        : undefined, // documents: PDFs, spreadsheets, etc. — validated at the call site
    });
    if (createErr) throw new Error(`createBucket(${name}) failed: ${createErr.message}`);
    created.push(name);
  }
  return { created, existing: [...have] };
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
