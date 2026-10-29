'use client';

import { useRef, useState, useTransition } from 'react';
import { createPageAction, proposePageAction } from '../../actions';
import { slugify } from '@/lib/site/blocks';
import type { Block } from '@/lib/site/blocks';

/**
 * New page (ALL CAN §6.2): title, address, hidden toggle, and "Build with
 * Claude": describe the page, Claude proposes blocks from the records, the
 * editor reviews before the page is created as a draft.
 */
export function NewPageDialog({ brand }: { brand: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');
  const [proposal, setProposal] = useState<{ title: string; blocks: Block[]; why: string[] } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn-gold btn-sm" onClick={() => ref.current?.showModal()}>New page</button>
      <dialog ref={ref} className="card w-[min(640px,92vw)] p-0" onClose={() => setProposal(null)}>
        <form action={createPageAction} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="brand" value={brand} />
          <div className="card-head"><h2>New page</h2><button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => ref.current?.close()}>Close</button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col"><label className="field-label" htmlFor="np-title">Title</label><input id="np-title" name="title" required className="input text-sm" value={title} onChange={(e) => { setTitle(e.target.value); if (!slug || slug === slugify(title)) setSlug(slugify(e.target.value)); }} /></div>
            <div className="flex flex-col"><label className="field-label" htmlFor="np-slug">Address</label><div className="flex items-center gap-1"><span className="mono text-xs text-silver">/</span><input id="np-slug" name="slug" className="input mono text-xs" value={slug} onChange={(e) => setSlug(e.target.value)} /></div></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hidden" /> Hide from the menu (reachable by link only)</label>
          <div className="rounded border border-hairline p-3">
            <p className="label mb-1 text-[10px]">Build with Claude</p>
            <textarea className="input text-sm w-full" rows={2} placeholder="e.g. A page for the Orangeville summer skills camp with dates, price and a sign-up form" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <div className="mt-2 flex items-center gap-2"><button type="button" className="btn-ghost btn-sm" disabled={pending || desc.trim().length < 8} onClick={() => start(async () => { const p = await proposePageAction(brand, desc); setProposal(p); if (!title) { setTitle(p.title); setSlug(slugify(p.title)); } })}>{pending ? 'Proposing…' : 'Propose a page'}</button><span className="text-xs text-silver">Uses this site&apos;s records. You review before anything is saved.</span></div>
            {proposal && (
              <div className="mt-3 text-sm">
                <p className="font-bold">{proposal.blocks.length} blocks proposed</p>
                <ol className="ml-4 list-decimal text-xs">{proposal.blocks.map((b) => <li key={b.id}>{b.type.replace('_', ' ')}{typeof b.props.heading === 'string' && b.props.heading ? ` · ${b.props.heading}` : ''}</li>)}</ol>
                {proposal.why.length > 0 && <ul className="mt-1 text-xs text-silver">{proposal.why.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                <input type="hidden" name="blocks" value={JSON.stringify(proposal.blocks)} />
              </div>
            )}
          </div>
          <div className="flex gap-2"><button type="submit" className="btn-gold btn-sm">{proposal ? 'Create draft from proposal' : 'Create empty draft'}</button></div>
        </form>
      </dialog>
    </>
  );
}
