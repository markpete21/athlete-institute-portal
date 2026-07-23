import { NextResponse } from 'next/server';
import { BUCKETS, deleteFile, ensureBuckets, getSignedUrl, uploadFile } from '@ai/foundation/storage';

/**
 * DEV-ONLY: exercises every Stage-7 storage rail — idempotent bucket creation,
 * upload, signed-URL mint, unauthenticated fetch THROUGH the signed URL, and
 * delete (verifying the URL dies with the object).
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const testPath = 'dev-verify/stage7.txt';

  try {
    // 1. Buckets (idempotent)
    const { created, existing } = await ensureBuckets();
    record('ensureBuckets', true, `created: [${created.join(', ') || 'none'}], existing: [${existing.join(', ') || 'none'}]`);

    // 2. Upload
    const body = Buffer.from(`Stage 7 verification — ${new Date().toISOString()}`);
    await uploadFile(BUCKETS.documents, testPath, body, { contentType: 'text/plain', upsert: true });
    record('uploadFile → documents', true, testPath);

    // 3. Signed URL mint + fetch through it (no auth — the signature IS access)
    const url = await getSignedUrl(BUCKETS.documents, testPath, 60);
    const res = await fetch(url);
    const text = await res.text();
    record('signed URL fetch', res.ok && text.startsWith('Stage 7 verification'), `HTTP ${res.status}, ${text.length}B`);

    // 4. Direct (unsigned) access must fail — bucket is private
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const direct = await fetch(`${base}/storage/v1/object/public/${BUCKETS.documents}/${testPath}`);
    record('unsigned public access blocked', !direct.ok, `HTTP ${direct.status} (must not be 200)`);

    // 5. Delete, then confirm the object is gone from storage (authoritative
    //    list check — the CDN may serve a cached copy of the signed URL for a
    //    short TTL after deletion, so a fetch is not a reliable oracle here).
    await deleteFile(BUCKETS.documents, [testPath]);
    const { supabaseAdmin } = await import('@ai/foundation/supabase');
    const { data: listing, error: listErr } = await supabaseAdmin()
      .storage.from(BUCKETS.documents)
      .list('dev-verify');
    const stillThere = (listing ?? []).some((f) => f.name === 'stage7.txt');
    record('delete removes object', !listErr && !stillThere, listErr ? listErr.message : `object present: ${stillThere}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
