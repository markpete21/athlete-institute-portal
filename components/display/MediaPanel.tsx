'use client';

import { useEffect, useState } from 'react';

/**
 * The 9:16 media panel (Module 2 Stage 6): single image, single video, or a
 * mixed photo/video slideshow. Videos autoplay muted (TVs have no cursor).
 */
export function MediaPanel({
  mode,
  urls,
  slideSeconds,
}: {
  mode: 'image' | 'video' | 'slideshow';
  urls: string[];
  slideSeconds: number;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (mode !== 'slideshow' || urls.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % urls.length), slideSeconds * 1000);
    return () => clearInterval(t);
  }, [mode, urls.length, slideSeconds]);

  if (urls.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-2xl font-extrabold tracking-tight text-white/40">
          Athlete Institute<span style={{ color: 'var(--accent)' }}>.</span>
        </span>
      </div>
    );
  }

  const url = urls[Math.min(idx, urls.length - 1)];
  const isVideo = mode === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(url);

  return isVideo ? (
    <video
      key={url}
      src={url}
      className="h-full w-full object-cover"
      autoPlay
      muted
      loop={mode !== 'slideshow'}
      playsInline
      onEnded={mode === 'slideshow' ? () => setIdx((i) => (i + 1) % urls.length) : undefined}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={url} src={url} alt="" className="h-full w-full object-cover" />
  );
}
