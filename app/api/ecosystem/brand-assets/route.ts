import { NextResponse } from 'next/server';
import { WORDMARK } from '@/components/brand/PlayWordmark';
import { listBrands } from '@/lib/brands/brands';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC brand manifest for the whole ecosystem. Any Athlete Institute app
 * (live stream, tickets, apps hub, Goals dashboard, future team app) can fetch
 * this one URL and render the same brand marks and Play lockups without copying
 * files or CSS:
 *
 *   const brand = await fetch('https://play.athleteinstitute.ca/api/ecosystem/brand-assets')
 *                        .then(r => r.json());
 *   brand.brands.find(b => b.key === 'bears').logoUrl   // <img src=...>
 *   brand.wordmarks.portal.dark                         // Play. APP svg
 *   brand.palette.accent                                // house gold
 *
 * Deliberately UNAUTHENTICATED and cache-friendly: these are the public-facing
 * marks, already served from a public bucket, and consumers include signed-out
 * pages. Anything private (member photos, documents) is NOT exposed here.
 *
 * Staff change a name/accent/logo in Admin > Brands and every consumer picks it
 * up on their next fetch — no redeploys anywhere.
 */
const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand-assets`;

export async function GET() {
  const brands = await listBrands();

  const body = {
    updatedAt: new Date().toISOString(),
    palette: {
      red: WORDMARK.red,        // Play — All Canadian red
      accent: WORDMARK.gold,    // house gold (the single accent)
      silver: WORDMARK.silver,
      ink: '#1e1e1e',
      dark: '#171613',          // the constant dark chrome surface
      paper: '#ffffff',
    },
    apps: {
      play: process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca',
      admin: process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.athleteinstitute.ca',
      compete: process.env.NEXT_PUBLIC_COMPETE_URL ?? 'https://compete.athleteinstitute.ca',
    },
    fonts: {
      display: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
      note: 'Play is Inter 900; the qualifier (APP/ADMIN) is JetBrains Mono 500, uppercase, 0.17em tracking.',
    },
    wordmarks: {
      portal: { dark: `${STORAGE}/play/wordmark-portal.svg`, light: `${STORAGE}/play/wordmark-portal-light.svg` },
      admin: { dark: `${STORAGE}/play/wordmark-admin.svg`, light: `${STORAGE}/play/wordmark-admin-light.svg` },
      compete: { dark: `${STORAGE}/play/wordmark-compete.svg`, light: `${STORAGE}/play/wordmark-compete-light.svg` },
    },
    brands: brands.map((b) => ({
      key: b.key,
      name: b.name,
      accent: b.accent,
      accentInk: b.accentInk,
      tagline: b.tagline,
      logoUrl: b.logoUrl,          // null until a logo is uploaded in Admin > Brands
      showInHeader: b.showInHeader,
      sortOrder: b.sortOrder,
    })),
  };

  return NextResponse.json(body, {
    headers: {
      // Public marks change rarely; let consumers and the CDN cache but revalidate.
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      'access-control-allow-origin': '*',
    },
  });
}
