'use client';

import { useState } from 'react';

/**
 * Public assigned-staff display (Module 5 Stage 2): photo with role underneath;
 * click/hover the image to pop the bio. Used on program registration pages and
 * public portal "our coaches" pages.
 */
export interface PublicStaff {
  id: number;
  name: string;
  role: string | null;
  photoUrl: string | null;
  bio: string | null;
}

export function StaffGrid({ staff }: { staff: PublicStaff[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (staff.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-5">
      {staff.map((s) => (
        <div key={s.id} className="relative flex w-28 flex-col items-center gap-1 text-center">
          <button
            type="button"
            className="h-28 w-28 overflow-hidden rounded-full border border-hairline bg-paper-panel"
            onMouseEnter={() => setOpen(s.id)}
            onMouseLeave={() => setOpen((v) => (v === s.id ? null : v))}
            onClick={() => setOpen((v) => (v === s.id ? null : s.id))}
            aria-label={`${s.name} bio`}
          >
            {s.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-silver">
                {s.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
              </span>
            )}
          </button>
          <p className="text-sm font-bold text-ink">{s.name}</p>
          {s.role && <p className="label text-[10px]">{s.role}</p>}
          {open === s.id && s.bio && (
            <div className="absolute top-full z-10 mt-2 w-56 border border-hairline bg-paper p-3 text-left text-xs text-body shadow-lg">
              {s.bio}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
