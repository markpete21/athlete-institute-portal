import { listLocations, SPORTS, type SiteLocation } from '@/lib/site/records';
import { listMedia } from '@/lib/site/media';
import { saveLocationAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';
import { PreviewButton } from '../PreviewButton';

export const dynamic = 'force-dynamic';

/**
 * Locations records (ALL CAN §6.3): the facts every location page, the finder,
 * the mega menu and Ask read from. Saving a new location also creates its
 * page and a page per sport. Status and launch label drive the pills.
 */
export default async function LocationsAdmin({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  const [locs, media] = await Promise.all([listLocations(brand), listMedia(brand)]);
  const photos = media.filter((m) => m.kind === 'photo');
  return (
    <div className="flex flex-col gap-5">
      {locs.map((l) => <LocationForm key={l.id} brand={brand} loc={l} photos={photos} />)}
      <details className="card p-5">
        <summary className="cursor-pointer text-base font-extrabold">+ Add a location</summary>
        <div className="mt-4"><LocationForm brand={brand} loc={null} photos={photos} /></div>
      </details>
    </div>
  );
}

function LocationForm({ brand, loc, photos }: { brand: string; loc: SiteLocation | null; photos: { url: string; name: string }[] }) {
  const F = ({ id, label, name, value, hint, wide, rows }: { id: string; label: string; name: string; value?: string | null; hint?: string; wide?: boolean; rows?: number }) => (
    <div className={`flex flex-col ${wide ? 'sm:col-span-2' : ''}`}><label className="field-label" htmlFor={id}>{label}</label>
      {rows ? <textarea id={id} name={name} rows={rows} defaultValue={value ?? ''} className="input text-sm" /> : <input id={id} name={name} defaultValue={value ?? ''} className="input text-sm" />}
      {hint && <span className="mt-1 text-xs text-silver">{hint}</span>}</div>
  );
  const k = loc?.id ?? 'new';
  return (
    <form action={saveLocationAction} className={loc ? 'card flex flex-col gap-4 p-5' : 'flex flex-col gap-4'}>
      <input type="hidden" name="brand" value={brand} />{loc && <input type="hidden" name="id" value={loc.id} />}
      {loc && <div className="card-head"><h2>{loc.name}</h2><span className="card-head-lbl mono">/{loc.slug}</span><span className="ml-auto flex gap-2"><PreviewButton brand={brand} path={`/${loc.slug}`} label="Preview page" /></span></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <F id={`l-${k}-name`} label="Name" name="name" value={loc?.name} hint="e.g. Toronto Midtown" />
        <F id={`l-${k}-slug`} label="Slug" name="slug" value={loc?.slug} hint="URL path; leave blank to derive" />
        <F id={`l-${k}-city`} label="City" name="city" value={loc?.city} />
        <F id={`l-${k}-region`} label="Region" name="region" value={loc?.region ?? 'Ontario'} />
        <div className="flex flex-col"><label className="field-label" htmlFor={`l-${k}-status`}>Status</label>
          <select id={`l-${k}-status`} name="status" defaultValue={loc?.status ?? 'opening_soon'} className="input text-sm"><option value="open">Open</option><option value="opening_soon">Opening soon</option><option value="waitlist">Waitlist</option><option value="closed">Closed</option></select></div>
        <F id={`l-${k}-launch`} label="Launch label" name="launchLabel" value={loc?.launchLabel} hint="e.g. Opening Fall 2026" />
        <F id={`l-${k}-venue`} label="Venue" name="venue" value={loc?.venue} />
        <F id={`l-${k}-addr`} label="Address" name="address" value={loc?.address} wide />
        <F id={`l-${k}-park`} label="Parking" name="parking" value={loc?.parking} />
        <F id={`l-${k}-arr`} label="Arrival" name="arrival" value={loc?.arrival} />
        <F id={`l-${k}-contact`} label="Contact" name="contact" value={loc?.contact} hint="Email or phone shown on the page" />
        <F id={`l-${k}-social`} label="Social link" name="socialUrl" value={loc?.socialUrl} />
        <div className="flex flex-col sm:col-span-2 lg:col-span-3"><span className="field-label">Sports offered</span>
          <div className="flex flex-wrap gap-3">{SPORTS.map((s) => <label key={s.slug} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="sports" value={s.slug} defaultChecked={loc?.sports.includes(s.slug) ?? s.slug === 'basketball'} /> {s.name}</label>)}</div></div>
        <F id={`l-${k}-note`} label="Note" name="note" value={loc?.note} rows={2} wide hint="Shown under the facts, e.g. a seasonal notice" />
        <F id={`l-${k}-cal`} label="Season calendar" name="calendar" value={loc?.calendar.map((c) => c.join(' | ')).join('\n')} rows={4} hint="One per line: Label | Value" />
        <div className="flex flex-col"><label className="field-label" htmlFor={`l-${k}-photo`}>Photo</label>
          <select id={`l-${k}-photo`} name="photoUrl" defaultValue={loc?.photoUrl ?? ''} className="input text-sm"><option value="">None</option>{photos.map((p) => <option key={p.url} value={p.url}>{p.name}</option>)}</select></div>
        <F id={`l-${k}-alt`} label="Photo alt text" name="photoAlt" value={loc?.photoAlt} />
        <F id={`l-${k}-sort`} label="Order" name="sortOrder" value={String(loc?.sortOrder ?? 100)} />
      </div>
      <div><SubmitButton className="btn-gold btn-sm">{loc ? 'Save location' : 'Create location and its pages'}</SubmitButton></div>
    </form>
  );
}
