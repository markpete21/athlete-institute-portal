'use client';

import { useEffect, useRef } from 'react';
import LeadForm from '@/components/site/LeadForm';

/**
 * "Apply for 2027-28" popout on the Circuit page: a native <dialog> holding
 * the team-application form. Escape and the scrim close it; the form posts
 * to /api/site/lead as kind "apply", which emails the site contact.
 */
export default function ApplyDialog({ brandKey, siteName, season, divisions, label = `Apply for ${'2027-28'}`, className = 'pill pill--red' }: { brandKey: string; siteName: string; season: string; divisions: string[]; label?: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => { if (e.target === d) d.close(); };
    d.addEventListener('click', onClick);
    return () => d.removeEventListener('click', onClick);
  }, []);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="apply-dialog" aria-labelledby="apply-title">
        <div className="apply-head"><h2 id="apply-title">Apply for {season}.</h2><button type="button" className="pill pill--line pill--sm" onClick={() => ref.current?.close()}>Close</button></div>
        <div className="apply-body">
          <p className="muted" style={{ marginBottom: 16 }}>For teams and clubs that want a place in next season&apos;s Circuit. We reply to every application.</p>
          <LeadForm brandKey={brandKey} variant="apply" context={`Circuit ${season} application`} siteName={siteName} programOptions={[...divisions, 'Other']} />
        </div>
      </dialog>
    </>
  );
}
