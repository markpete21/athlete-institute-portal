import { supabaseAdmin } from '@ai/foundation/supabase';
import { addVideoAction, archiveAction, createGalleryAction, uploadPhotosAction } from './actions';

export const dynamic = 'force-dynamic';

/** Admin: gallery management (Module 17) - create, upload, register video, archive. */
export default async function GalleryAdminPage() {
  const db = supabaseAdmin();
  const { data: galleries } = await db.from('galleries').select('id, title, archived_at, programs(name)').order('id', { ascending: false }).limit(30);
  const counts = new Map<number, number>();
  for (const g of galleries ?? []) {
    const { count } = await db.from('gallery_media').select('id', { count: 'exact', head: true }).eq('gallery_id', g.id);
    counts.set(g.id, count ?? 0);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between border-b border-hairline pb-4">
        <div><p className="label text-[11px]">Photo &amp; Video Gallery</p><h1 className="text-3xl">Galleries<span style={{ color: 'var(--accent)' }}>.</span></h1></div>
        <form action={archiveAction}><button className="btn-ghost btn-sm">Archive &gt; 6 months</button></form>
      </header>

      <form action={createGalleryAction} className="card flex flex-wrap items-end gap-2 p-4">
        <div><label className="field-label">Program ID</label><input name="programId" type="number" required className="input w-28 text-sm" /></div>
        <div className="grow"><label className="field-label">Title</label><input name="title" required placeholder="Week 3 highlights" className="input w-full text-sm" /></div>
        <button className="btn-gold btn-sm">Create gallery</button>
      </form>

      <div className="flex flex-col gap-4">
        {(galleries ?? []).map((g) => (
          <div key={g.id} className="card flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="flex flex-col"><span className="font-bold text-ink">{g.title}</span><span className="text-xs text-silver">{(g.programs as unknown as { name: string } | null)?.name}</span></span>
              <span className="flex gap-2">
                <span className="tag">{counts.get(g.id) ?? 0} items</span>
                {g.archived_at && <span className="tag">archived</span>}
              </span>
            </div>
            <form action={uploadPhotosAction} className="flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="galleryId" value={g.id} />
              <div><label className="field-label">Photos</label><input name="photos" type="file" accept="image/*" multiple className="input text-xs" /></div>
              <label className="flex items-center gap-1 pb-2"><input type="checkbox" name="notify" defaultChecked /> Notify families</label>
              <button className="btn-ghost btn-sm">Upload</button>
            </form>
            <form action={addVideoAction} className="flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="galleryId" value={g.id} />
              <div><label className="field-label">Video stream ref (from live pipeline)</label><input name="streamRef" required placeholder="stream id / slug" className="input text-sm" /></div>
              <div><label className="field-label">Caption</label><input name="caption" className="input text-sm" /></div>
              <label className="flex items-center gap-1 pb-2"><input type="checkbox" name="notify" /> Notify</label>
              <button className="btn-ghost btn-sm">Add video</button>
            </form>
          </div>
        ))}
        {(galleries ?? []).length === 0 && <p className="text-body">No galleries yet.</p>}
      </div>
    </main>
  );
}
