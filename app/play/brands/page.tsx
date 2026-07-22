import Link from 'next/link';
import { BRANDS, brandCssVars, resolveBrand, type Brand } from '@ai/foundation';

/**
 * Brand preview (Stage-5 verification). Renders every seeded brand with its own
 * render-time theming, and — when ?brand=<key> is present — themes the whole
 * page to that brand, proving `resolveBrand` + `--accent` resolution end to end.
 * Becomes the seed for the admin brand editor once the brands table exists.
 */
export default function BrandsPreview({
  searchParams,
}: {
  searchParams: { brand?: string };
}) {
  const active = resolveBrand(searchParams.brand);
  const pageVars = brandCssVars(active) as React.CSSProperties;

  return (
    <main style={pageVars} className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3 border-b border-hairline pb-6">
        <p className="label text-[11px]">Module 0 · Stage 5 · Brand theming</p>
        <h1 className="text-5xl">
          Brands<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="max-w-xl text-body">
          One shared design system (Orangeville Prep / Vanguard), four brands.
          Active theme:{' '}
          <span className="mono" style={{ color: 'var(--accent)' }}>
            {active.name}
          </span>
          . Click a card to re-theme this page.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/brands" className="btn-ghost btn-sm">Default</Link>
          {BRANDS.map((b) => (
            <Link key={b.key} href={`/brands?brand=${b.key}`} className="btn-gold btn-sm">
              {b.name}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-5 sm:grid-cols-2">
        {BRANDS.map((b) => (
          <BrandCard key={b.key} brand={b} isActive={b.key === active.key} />
        ))}
      </section>

      <Link href="/" className="label text-[11px] hover:text-ink">← Back to portal</Link>
    </main>
  );
}

function BrandCard({ brand, isActive }: { brand: Brand; isActive: boolean }) {
  const vars = brandCssVars(brand) as React.CSSProperties;
  return (
    <div style={vars} className="card flex flex-col gap-4 p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-3xl">
          {brand.name}<span style={{ color: 'var(--accent)' }}>.</span>
        </h2>
        {isActive && <span className="tag">active</span>}
      </div>

      <div className="flex items-center gap-3">
        <span
          className="inline-block h-8 w-8 border border-hairline"
          style={{ backgroundColor: 'var(--accent)' }}
          aria-hidden
        />
        <code className="mono text-sm text-body">{brand.accent}</code>
        {brand.provisional && <span className="tag text-neg">provisional</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-gold btn-sm" type="button">Register</button>
        <button className="btn-ghost btn-sm" type="button">Details</button>
        <span className="tag">{brand.key}</span>
      </div>
    </div>
  );
}
