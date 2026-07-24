'use client';

import { useState } from 'react';

/** Spin-to-win wheel (Module 20). Server enforces unlock + odds + credit. */
export default function SpinWheel({ locked, needed }: { locked: boolean; needed: number }) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const spin = async () => {
    setSpinning(true);
    setResult(null);
    try {
      const res = await fetch('/api/promotions/spin', { method: 'POST' });
      const json = await res.json();
      // small suspense delay for the animation
      await new Promise((r) => setTimeout(r, 1200));
      if (json.locked) setResult(`Locked — earn ${json.needed} more lifetime points to unlock.`);
      else setResult(`🎉 ${json.prize.label}!`);
    } finally {
      setSpinning(false);
    }
  };

  return (
    <div className="card flex flex-col items-center gap-3 p-5 text-center">
      <div className={`flex h-28 w-28 items-center justify-center rounded-full border-4 text-4xl ${spinning ? 'animate-spin' : ''}`} style={{ borderColor: 'var(--accent)' }}>
        🎡
      </div>
      {locked && !result ? (
        <p className="text-sm text-body">Spin unlocks at your next milestone — {needed.toLocaleString()} more lifetime points.</p>
      ) : (
        <button onClick={spin} disabled={spinning} className="btn-gold w-full">{spinning ? 'Spinning…' : 'Spin to win'}</button>
      )}
      {result && <p className="text-ink">{result}</p>}
    </div>
  );
}
