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

  // No media configured: a deliberate brand moment rather than a void —
  // dot-field texture, hairline frame, stacked wordmark on the accent.
  if (urls.length === 0) {
    return (
      <div className="dot-field relative flex h-full flex-col justify-between border-r border-white/10 p-10">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)' }}
        />
        <span className="relative h-1.5 w-16" style={{ backgroundColor: 'var(--accent, #9e8959)' }} />
        <div className="relative flex flex-col gap-4">
          <span className="font-mono text-sm uppercase tracking-[0.3em] text-white/50">
            Orangeville, ON
          </span>
          <span className="text-6xl font-extrabold leading-[0.95] tracking-tight text-white">
            Athlete
            <br />
            Institute
            <span style={{ color: 'var(--accent, #9e8959)' }}>.</span>
          </span>
        </div>
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
