'use client';

import { useState } from 'react';

/** Spin-to-win wheel (Module 20). Server enforces unlock + odds + credit. */
export default function SpinWheel({ locked, needed, spinsAvailable }: { locked: boolean; needed: number; spinsAvailable: number }) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [left, setLeft] = useState(spinsAvailable);
  const [isLocked, setIsLocked] = useState(locked);
  const [need, setNeed] = useState(needed);

  const spin = async () => {
    setSpinning(true);
    setResult(null);
    try {
      const res = await fetch('/api/promotions/spin', { method: 'POST' });
      const json = await res.json();
      // small suspense delay for the animation
      await new Promise((r) => setTimeout(r, 1200));
      if (json.locked) {
        setIsLocked(true);
        setNeed(json.needed ?? 0);
        setLeft(0);
        setResult(`Locked — earn ${json.needed} more lifetime points for your next spin.`);
      } else {
        setLeft(json.spinsLeft ?? 0);
        if ((json.spinsLeft ?? 0) === 0) setIsLocked(true);
        setResult(`🎉 ${json.prize.label}!`);
      }
    } finally {
      setSpinning(false);
    }
  };

  return (
    <div className="card flex flex-col items-center gap-3 p-5 text-center">
      <div className={`flex h-28 w-28 items-center justify-center rounded-full border-4 text-4xl ${spinning ? 'animate-spin' : ''}`} style={{ borderColor: 'var(--accent)' }}>
        🎡
      </div>
      {isLocked ? (
        !result && <p className="text-sm text-body">Your next spin unlocks in {need.toLocaleString()} more lifetime points.</p>
      ) : (
        <>
          <p className="text-xs text-silver">{left} spin{left === 1 ? '' : 's'} available</p>
          <button onClick={spin} disabled={spinning} className="btn-gold w-full">{spinning ? 'Spinning…' : 'Spin to win'}</button>
        </>
      )}
      {result && <p className="text-ink">{result}</p>}
    </div>
  );
}
