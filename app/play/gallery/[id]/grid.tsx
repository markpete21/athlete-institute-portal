'use client';

import { useState } from 'react';
import type { MediaBrowseItem } from '@/lib/gallery/gallery';

/** Client grid: multi-select photos -> zip download; tap video -> stream. */
export default function GalleryGrid({ galleryId, media }: { galleryId: number; media: MediaBrowseItem[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/gallery/zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ galleryId, mediaIds: [...selected] }),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gallery-${galleryId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {media.length === 0 && <p className="text-body">No photos or video yet.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {media.map((m) => (
          <div key={m.id} className={`relative border ${selected.has(m.id) ? 'border-[var(--accent)]' : 'border-hairline'}`}>
            {m.kind === 'video' ? (
              <a href={m.streamUrl ?? '#'} target="_blank" rel="noreferrer" className="block">
                {m.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbUrl} alt={m.caption ?? 'video'} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-[#111] text-3xl text-white">▶</div>
                )}
                <span className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">▶ stream</span>
              </a>
            ) : (
              <button type="button" onClick={() => toggle(m.id)} className="block w-full">
                {m.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbUrl} alt={m.caption ?? 'photo'} className="aspect-square w-full object-cover" />
                )}
                {selected.has(m.id) && <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-[var(--accent)] text-xs text-white">✓</span>}
              </button>
            )}
          </div>
        ))}
      </div>
      {selected.size > 0 && (
        <button onClick={download} disabled={downloading} className="btn-gold w-full">
          {downloading ? 'Preparing zip…' : `Download ${selected.size} photo${selected.size > 1 ? 's' : ''} (full resolution)`}
        </button>
      )}
      <p className="text-xs text-silver">Browse uses thumbnails; downloads are the full-resolution originals. Videos stream — tap to watch.</p>
    </div>
  );
}
