import { NextResponse } from 'next/server';
import { BUCKETS, ensureBuckets, getPublicUrl } from '@ai/foundation/storage';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { headerBrands, listBrands, removeBrandLogo, updateBrand, uploadBrandLogo } from '@/lib/brands/brands';

/**
 * DEV-ONLY: brand settings - public bucket exists, logo upload -> public URL
 * that is actually fetchable WITHOUT auth (the header renders for signed-out
 * visitors), replace removes the old object, remove clears the row, editable
 * fields save, header ordering honored. Restores original state.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (s: string, ok: boolean, d: string) => steps.push({ step: s, ok, detail: d });
  const KEY = 'all-can';
  let original: Record<string, unknown> | null = null;

  try {
    const { data: before } = await db.from('brands').select('name, accent, tagline, logo_url, logo_path, show_in_header, sort_order').eq('key', KEY).maybeSingle();
    original = before ?? null;

    // 1. public bucket provisioned
    const buckets = await ensureBuckets();
    const { data: list } = await db.storage.listBuckets();
    const bucket = (list ?? []).find((b) => b.name === BUCKETS.brandAssets);
    record('brand-assets bucket exists and is PUBLIC', !!bucket && bucket.public === true, `public=${bucket?.public}`);
    void buckets;

    // 2. the four header brands are seeded, in order
    const header = await headerBrands();
    const keys = header.map((b) => b.key);
    record('four brands in the header, ordered', keys.length === 4 && keys[0] === 'athlete-institute' && keys[3] === 'all-canadian-games', keys.join(', '));

    // 3. upload a logo -> public URL, fetchable with NO auth header
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#d8232a"/></svg>';
    const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });
    const up = await uploadBrandLogo({ key: KEY, file, actorClerkId: 'system:verify' });
    const res = await fetch(up.logoUrl, { cache: 'no-store' });
    const body = await res.text();
    record('logo upload -> anonymous-readable public URL', res.status === 200 && body.includes('#d8232a'), `HTTP ${res.status}`);

    // 4. the brand row carries the URL so the header can render it
    const rowAfter = (await listBrands()).find((b) => b.key === KEY)!;
    record('brand row stores logo URL + path', rowAfter.logoUrl === up.logoUrl && rowAfter.logoPath === up.logoPath, up.logoPath);

    // 5. replacing deletes the previous object (no orphan tail)
    const oldPath = up.logoPath;
    const svg2 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#00ff00"/></svg>';
    const up2 = await uploadBrandLogo({ key: KEY, file: new File([svg2], 'logo.svg', { type: 'image/svg+xml' }), actorClerkId: 'system:verify' });
    const { data: leftover } = await db.storage.from(BUCKETS.brandAssets).list(KEY);
    const names = (leftover ?? []).map((f) => `${KEY}/${f.name}`);
    record('replace removes the previous object', up2.logoPath !== oldPath && !names.includes(oldPath), `${names.length} object(s) left`);

    // 6. rejects a non-image and an oversized file
    let badType = false, badSize = false;
    try { await uploadBrandLogo({ key: KEY, file: new File(['x'], 'a.txt', { type: 'text/plain' }), actorClerkId: 'system:verify' }); } catch { badType = true; }
    try { await uploadBrandLogo({ key: KEY, file: new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', { type: 'image/png' }), actorClerkId: 'system:verify' }); } catch { badSize = true; }
    record('rejects wrong type and >2MB', badType && badSize, `type=${badType} size=${badSize}`);

    // 7. editable fields save + accent validation
    await updateBrand({ key: KEY, tagline: 'Verify tagline', accent: '#d8232a', actorClerkId: 'system:verify' });
    let badHex = false;
    try { await updateBrand({ key: KEY, accent: 'red', actorClerkId: 'system:verify' }); } catch { badHex = true; }
    const edited = (await listBrands()).find((b) => b.key === KEY)!;
    record('fields save; invalid hex rejected', edited.tagline === 'Verify tagline' && badHex, `tagline ok, badHex=${badHex}`);

    // 8. remove clears the row (header falls back to the built-in mark)
    await removeBrandLogo(KEY, 'system:verify');
    const cleared = (await listBrands()).find((b) => b.key === KEY)!;
    record('remove clears logo url + path', cleared.logoUrl === null && cleared.logoPath === null, 'cleared');
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    // restore whatever was there before the test
    if (original) {
      await db.from('brands').update(original).eq('key', KEY);
      const p = original.logo_path as string | null;
      if (p) { try { void getPublicUrl(BUCKETS.brandAssets, p); } catch { /* ignore */ } }
    }
    const { data: files } = await db.storage.from(BUCKETS.brandAssets).list(KEY);
    const stale = (files ?? []).map((f) => `${KEY}/${f.name}`).filter((p) => p !== original?.logo_path);
    if (stale.length) await db.storage.from(BUCKETS.brandAssets).remove(stale);
    record('cleanup', true, `restored brand row, removed ${stale.length} test object(s)`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
