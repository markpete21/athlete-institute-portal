import Link from 'next/link';

/**
 * Compete. 404 — an unpublished or deleted division reads the same as one that
 * never existed (lib/compete returns null for both, on purpose). This renders
 * inside the Compete chrome so a dead shared link still lands somewhere useful.
 */
export default function CompeteNotFound() {
  return (
    <div className="cs-head">
      <p className="label text-[11px]">Not found</p>
      <h1 className="cs-h1">No standings here<span className="cs-h1-dot">.</span></h1>
      <p className="cs-lede">
        This division isn&apos;t published — the season may have wrapped up, or the link is out of date.
      </p>
      <p className="mt-3.5">
        <Link href="/" className="cs-cta-btn">All divisions →</Link>
      </p>
    </div>
  );
}
