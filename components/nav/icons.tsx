/**
 * Inline stroke icons for the AdminShell (no icon-font dependency; currentColor
 * so they inherit rail/active/accent states). Keys match ModuleKey plus a few
 * UI glyphs.
 */
const PATHS: Record<string, string> = {
  programs: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4',
  camps: 'M12 4l9 16H3zM12 4v16M7 20l5-7 5 7',
  club: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  academy: 'M3 9l9-4 9 4-9 4zM7 11v5c0 1 2.5 2.5 5 2.5s5-1.5 5-2.5v-5M21 9v5',
  competitive: 'M7 4h10v3a5 5 0 0 1-10 0zM12 12v4M9 20h6M8 5H5v1a3 3 0 0 0 3 3M16 5h3v1a3 3 0 0 1-3 3',
  schedule: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  facilities: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5',
  conflicts: 'M12 3l9 16H3zM12 10v4M12 17v.5',
  rentals: 'M11 12l8-8M17 3l3 3M14 7l2 2',
  displays: 'M2 4h20v13H2zM8 21h8M12 17v4',
  staff: 'M5 20a7 7 0 0 1 14 0',
  roles: 'M4 10h16v10H4zM8 10V7a4 4 0 0 1 8 0v3',
  waivers: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  import: 'M12 3v12M8 11l4 4 4-4M4 21h16',
  brands: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4',
  comms: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  feedback: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z',
  points: 'M12 8v8M9.5 10.5c0-1.4 1.1-2 2.5-2s2.5.6 2.5 2-1.1 2-2.5 2-2.5.6-2.5 2 1.1 2 2.5 2 2.5-.6 2.5-2',
  promotions: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S9 3 6.5 4.5 9 8 12 8zM12 8s3-5 5.5-3.5S15 8 12 8z',
  gallery: 'M3 4h18v16H3zM21 16l-5-5-9 9',
  reports: 'M4 20V4M4 20h16M7 17v-5M12 17V8M17 17V5',
  retention: 'M12 21s-7-4.5-9-9.5C1.5 7 4 4 7 4c2 0 3 1 5 3 2-2 3-3 5-3 3 0 5.5 3 4 7.5-2 5-9 9.5-9 9.5z',
  dunning: 'M12 7v6M12 16v.5',
  assist: 'M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3zM18 15l.7 1.8L20.5 17l-1.8.7L18 19.5l-.7-1.8L15.5 17l1.8-.5z',
  // UI glyphs
  plus: 'M12 5v14M5 12h14',
  chev: 'M6 9l6 6 6-6',
  pin: 'M12 17v5M8 3h8l-1 6 3 3H6l3-3z',
  collapse: 'M14 6l-6 6 6 6M20 6l-6 6 6 6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
};

const CIRCLES: Record<string, { cx: number; cy: number; r: number }[]> = {
  staff: [{ cx: 12, cy: 8, r: 3.5 }],
  points: [{ cx: 12, cy: 12, r: 8 }],
  dunning: [{ cx: 12, cy: 12, r: 9 }],
  rentals: [{ cx: 8, cy: 15, r: 4 }],
  gallery: [{ cx: 8.5, cy: 9.5, r: 1.5 }],
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const d = PATHS[name];
  const circles = CIRCLES[name] ?? [];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {circles.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />)}
      {d && <path d={d} />}
    </svg>
  );
}
