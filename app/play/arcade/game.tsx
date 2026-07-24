'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Rotating HTML5 sports game (Module 20), mobile-first. One lightweight
 * timing-based engine skinned per sport: a marker sweeps a meter; tap in the
 * sweet zone to score and keep your run alive. Misses cost a life; the sweet
 * zone shrinks as your score climbs (high-score, keep-going style).
 */

const SKINS: Record<string, { emoji: string; verb: string; bg: string }> = {
  basketball: { emoji: '🏀', verb: 'Shoot', bg: '#8a5a2b' },
  soccer: { emoji: '⚽', verb: 'Strike', bg: '#2f6b3a' },
  volleyball: { emoji: '🏐', verb: 'Spike', bg: '#2f5d8a' },
  pickleball: { emoji: '🥒', verb: 'Smash', bg: '#5a7a2b' },
  football: { emoji: '🏈', verb: 'Kick', bg: '#6b3a2f' },
};

export default function SportGame({ contestId, gameKey }: { contestId: number; gameKey: string }) {
  const skin = SKINS[gameKey] ?? SKINS.basketball;
  const [pos, setPos] = useState(0);          // 0-100 marker position
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [state, setState] = useState<'ready' | 'playing' | 'over' | 'submitted'>('ready');
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const dir = useRef(1);
  const raf = useRef<number>();
  const posRef = useRef(0);
  const scoreRef = useRef(0);

  const zoneWidth = Math.max(8, 24 - Math.floor(score / 3) * 2); // shrinks as you score
  const zoneStart = 50 - zoneWidth / 2;

  useEffect(() => {
    if (state !== 'playing') return;
    const speed = 1.2 + scoreRef.current * 0.08;
    const tick = () => {
      posRef.current += dir.current * speed;
      if (posRef.current >= 100) { posRef.current = 100; dir.current = -1; }
      if (posRef.current <= 0) { posRef.current = 0; dir.current = 1; }
      setPos(posRef.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [state, score]);

  const tap = () => {
    if (state === 'ready') { setState('playing'); return; }
    if (state !== 'playing') return;
    const inZone = posRef.current >= zoneStart && posRef.current <= zoneStart + zoneWidth;
    if (inZone) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      setFlash('hit');
    } else {
      setLives((l) => {
        const next = l - 1;
        if (next <= 0) setState('over');
        return next;
      });
      setFlash('miss');
    }
    setTimeout(() => setFlash(null), 200);
  };

  const submit = async () => {
    await fetch('/api/promotions/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contestId, score: scoreRef.current }) });
    setState('submitted');
  };

  const reset = () => { scoreRef.current = 0; posRef.current = 0; dir.current = 1; setScore(0); setLives(3); setState('playing'); };

  return (
    <div className="card flex flex-col gap-4 p-5 text-center select-none" style={{ borderTop: `3px solid ${skin.bg}` }}>
      <div className="flex items-center justify-between text-sm">
        <span className="mono">Score {score}</span>
        <span className="text-2xl">{skin.emoji}</span>
        <span className="mono">{'❤️'.repeat(Math.max(0, lives))}</span>
      </div>

      {/* meter */}
      <div className="relative h-8 w-full border border-hairline bg-[#f2f2ef]">
        <div className="absolute inset-y-0" style={{ left: `${zoneStart}%`, width: `${zoneWidth}%`, background: flash === 'hit' ? '#3f7a5b' : flash === 'miss' ? '#b4483c' : 'var(--accent)' , opacity: 0.6 }} />
        <div className="absolute inset-y-0 w-1 bg-ink" style={{ left: `${pos}%` }} />
      </div>

      {state === 'over' ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink">Final score: <b>{score}</b></p>
          <button onClick={submit} className="btn-gold w-full">Submit to contest</button>
          <button onClick={reset} className="btn-ghost w-full">Play again</button>
        </div>
      ) : state === 'submitted' ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink">Score submitted — good luck! 🍀</p>
          <button onClick={reset} className="btn-ghost w-full">Play again</button>
        </div>
      ) : (
        <button onClick={tap} className="btn-gold w-full py-4 text-lg">
          {state === 'ready' ? `Tap to start` : `${skin.verb}!`}
        </button>
      )}
      <p className="text-xs text-silver">Tap when the marker is in the gold zone. The zone shrinks as you score — miss 3 and you&apos;re out.</p>
    </div>
  );
}
