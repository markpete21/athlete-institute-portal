import { listBrands } from '@/lib/brands/brands';
import { removeLogoAction, updateBrandAction, uploadLogoAction } from './actions';
import { SaveStatus, SubmitButton } from './SubmitButton';

export const dynamic = 'force-dynamic';

/**
 * Admin: Brand settings. Upload a logo per brand — it becomes the tile in the
 * public header immediately (public brand-assets bucket, cache-busted path).
 * Name/accent/tagline/order are editable here too, so brand changes never need
 * a deploy; anything left blank falls back to the code seed in @ai/foundation.
 */
export default async function BrandsPage() {
  const brands = await listBrands();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-7 py-9">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Settings</p>
        <h1 className="text-4xl">Brands<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body max-w-[65ch] text-sm">
          The logo you upload here is what appears as the brand tile at the top of the public site.
          SVG is best (sharp at any size); PNG or WebP with a transparent background also work. Max 2&nbsp;MB.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {brands.map((b) => (
          <section key={b.key} className="card flex flex-col gap-4 p-5" style={{ borderLeft: `3px solid ${b.accent}` }}>
            <div className="flex flex-wrap items-start gap-5">
              {/* live preview of the header tile */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex h-[66px] w-[66px] items-center justify-center border p-1.5"
                  style={{ background: '#171613', borderColor: b.accent }}
                >
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoUrl} alt={`${b.name} logo`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="mono text-[10px] text-silver">no logo</span>
                  )}
                </div>
                <span className="label text-[9px]">Header tile</span>
              </div>

              <div className="flex min-w-[240px] flex-1 flex-col gap-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl">{b.name}</h2>
                  <span className="mono text-xs text-silver">{b.key}</span>
                  {!b.showInHeader && <span className="tag text-[10px]">hidden from header</span>}
                </div>

                <form action={uploadLogoAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="key" value={b.key} />
                  <div className="flex flex-col">
                    <label className="field-label">Logo file</label>
                    <input
                      type="file"
                      name="logo"
                      required
                      accept="image/svg+xml,image/png,image/webp,image/jpeg"
                      className="input text-sm"
                    />
                  </div>
                  <SubmitButton className="btn-gold btn-sm" pendingLabel="Uploading…" doneLabel="Uploaded">
                    {b.logoUrl ? 'Replace logo' : 'Upload logo'}
                  </SubmitButton>
                  {b.logoUrl && (
                    <SubmitButton className="btn-ghost btn-sm" pendingLabel="Removing…" doneLabel="Removed" formAction={removeLogoAction}>
                      Remove
                    </SubmitButton>
                  )}
                  <SaveStatus />
                </form>
              </div>
            </div>

            <form action={updateBrandAction} className="flex flex-wrap items-end gap-2 border-t border-hairline pt-4">
              <input type="hidden" name="key" value={b.key} />
              <div className="grow">
                <label className="field-label">Display name</label>
                <input name="name" defaultValue={b.name} className="input w-full text-sm" />
              </div>
              <div>
                <label className="field-label">Accent</label>
                <input name="accent" defaultValue={b.accent} placeholder="#9e8959" className="input w-28 text-sm" />
              </div>
              <div className="grow">
                <label className="field-label">Tagline</label>
                <input name="tagline" defaultValue={b.tagline ?? ''} className="input w-full text-sm" />
              </div>
              <div>
                <label className="field-label">Order</label>
                <input name="sortOrder" type="number" defaultValue={b.sortOrder} className="input w-20 text-sm" />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="showInHeader" defaultChecked={b.showInHeader} /> In header
              </label>
              <SubmitButton>Save</SubmitButton>
              <SaveStatus />
            </form>
          </section>
        ))}
      </div>

      <p className="text-body text-xs">
        Note: the ALL CAN and All Canadian Games reds are nearly identical, and the Bears gold is the house accent — so
        brand colour alone can&apos;t tell these four apart. The logo does that work, which keeps colour free for other
        encodings (like per-child keys on the family schedule).
      </p>
    </main>
  );
}
