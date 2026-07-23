import { buildTree, flattenTree, type FacilityNode } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listDisplays, listTemplates } from '@/lib/displays';
import { createDisplayAction, deleteDisplayAction, saveTemplateAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * TV display configuration (Module 2 Stage 6) - templates (media panel +
 * content switches) and displays (token URL + template + facility scope).
 * The rendered display itself is the PUBLIC token URL on play.*.
 */
export default async function DisplaysAdminPage() {
  const [templates, displays, { data: facRows }] = await Promise.all([
    listTemplates(),
    listDisplays(),
    supabaseAdmin().from('facilities').select('id, parent_id, name, label, sort_order, bookable, deleted_at').is('deleted_at', null),
  ]);
  const ordered = flattenTree(buildTree((facRows ?? []) as FacilityNode[]));
  const playBase = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · TV displays</p>
        <h1 className="text-5xl">
          Displays<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <p className="text-body">
          Each display is a public unguessable URL - point any TV stick or kiosk
          browser at it and walk away (setup guide in the README). Only bookings
          flagged for the public schedule ever appear.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl">Displays</h2>
        {displays.length === 0 && <p className="text-body">None yet - create one below.</p>}
        {displays.map((d) => (
          <div key={d.id} className="card flex flex-wrap items-center gap-3 p-4">
            <span className="text-lg font-bold text-ink">{d.name}</span>
            <span className="tag">{templates.find((t) => t.id === d.template_id)?.name ?? 'no template'}</span>
            <span className="tag">{d.facility_ids.length ? `${d.facility_ids.length} facilities` : 'all facilities'}</span>
            <code className="mono flex-1 truncate text-xs text-silver">{playBase}/display/{d.token}</code>
            <a href={`/display/${d.token}`} target="_blank" className="btn-ghost btn-sm">Open</a>
            <form action={deleteDisplayAction}>
              <input type="hidden" name="displayId" value={d.id} />
              <button type="submit" className="btn-ghost btn-sm text-neg">Delete</button>
            </form>
          </div>
        ))}

        <form action={createDisplayAction} className="card grid gap-3 p-5 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <label className="field-label" htmlFor="d-name">Name</label>
            <input id="d-name" name="name" placeholder="Front lobby TV" required className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="d-template">Template</label>
            <select id="d-template" name="templateId" className="input" defaultValue="">
              <option value="">(none)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="d-fac">Facility scope</label>
            <select id="d-fac" name="facilityIds" className="input" defaultValue="">
              <option value="">All facilities</option>
              {ordered.map((f) => (
                <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-gold btn-sm">Create</button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl">Templates</h2>
        {templates.map((t) => (
          <TemplateForm key={t.id} template={t} />
        ))}
        <TemplateForm />
      </section>
    </main>
  );
}

function TemplateForm({ template }: { template?: Awaited<ReturnType<typeof listTemplates>>[number] }) {
  return (
    <form action={saveTemplateAction} className="card grid gap-3 p-5 sm:grid-cols-2">
      <div>
        <label className="field-label">Template name</label>
        <input name="name" defaultValue={template?.name ?? ''} placeholder={template ? undefined : 'New template…'} required className="input" />
      </div>
      <div>
        <label className="field-label">Media mode (9:16 left panel)</label>
        <select name="mediaMode" defaultValue={template?.media_mode ?? 'image'} className="input">
          <option value="image">Single image</option>
          <option value="video">Single video</option>
          <option value="slideshow">Photo/video slideshow</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="field-label">Media URLs (one per line)</label>
        <textarea name="mediaUrls" defaultValue={(template?.media_urls ?? []).join('\n')} rows={2} className="input" />
      </div>
      <div className="flex items-center gap-5">
        <label className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
          <input type="checkbox" name="showToday" defaultChecked={template?.show_today ?? true} /> today
        </label>
        <label className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
          <input type="checkbox" name="showUpcoming" defaultChecked={template?.show_upcoming ?? true} /> next 4 weeks
        </label>
        <label className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-silver">
          slide secs <input type="number" name="slideSeconds" defaultValue={template?.slide_seconds ?? 8} className="input w-16" />
        </label>
      </div>
      <div className="flex items-end justify-end">
        <button type="submit" className="btn-gold btn-sm">{template ? 'Save' : 'Add template'}</button>
      </div>
    </form>
  );
}
