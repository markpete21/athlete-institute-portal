'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SitePost } from '@/lib/site/posts';
import { slugify, type Block } from '@/lib/site/blocks';
import { deletePostAction, draftStoryAction, savePostAction } from '../../../actions';
import { PreviewButton } from '../../PreviewButton';

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Story editor: title, address, type, location, sport, program, cover, body
 * (rich text; paragraphs only, no raw HTML), Draft with Claude from a topic
 * and the records, then Save draft / Publish now / Schedule (Toronto time).
 */
export function StoryEditor({ brand, post, canPublish, locations, programs, images }: { brand: string; post: SitePost | null; canPublish: boolean; locations: { slug: string; name: string }[]; programs: { slug: string; name: string; locationSlug: string }[]; images: { url: string; name: string; alt: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [type, setType] = useState(post?.type ?? 'Announcement');
  const [loc, setLoc] = useState(post?.locationSlug ?? '');
  const [sport, setSport] = useState(post?.sport ?? '');
  const [prog, setProg] = useState(post?.programSlug ?? '');
  const [author, setAuthor] = useState(post?.authorLabel ?? '');
  const [cover, setCover] = useState(post?.coverUrl ?? '');
  const [coverAlt, setCoverAlt] = useState(post?.coverAlt ?? '');
  const [coverCredit, setCoverCredit] = useState(post?.coverCredit ?? '');
  const [html, setHtml] = useState(post?.body.map((b) => (b.type === 'rich_text' ? String(b.props.html ?? '') : '')).join('') || '<p></p>');
  const [when, setWhen] = useState('');
  const [topic, setTopic] = useState('');
  const [msg, setMsg] = useState('');
  const [tbc, setTbc] = useState(0);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== html && document.activeElement !== ref.current) ref.current.innerHTML = html; }, [html]);
  const body = (): Block[] => [{ id: post?.body[0]?.id ?? uid(), type: 'rich_text', props: { label: '', heading: '', html } }];
  const input = () => ({ id: post?.id, title, slug: slug || slugify(title), excerpt, type, locationSlug: loc || null, sport: sport || null, programSlug: prog || null, authorLabel: author, coverUrl: cover || null, coverAlt: coverAlt || null, coverCredit: coverCredit || null, body: body() });
  const save = (mode: 'draft' | 'publish' | 'schedule') => start(async () => {
    if (!title.trim()) { setMsg('Add a title.'); return; }
    if (mode === 'schedule' && !when) { setMsg('Pick a date and time to schedule.'); return; }
    const at = mode === 'schedule' ? new Date(when).toISOString() : null;
    const r = await savePostAction(brand, input(), mode, at);
    setMsg(mode === 'draft' ? 'Draft saved.' : mode === 'publish' ? 'Published.' : `Scheduled for ${new Date(when).toLocaleString('en-CA')}.`);
    if (!post) router.replace(`/admin/stories/${r.id}`);
  });
  const cmd = (c: string, arg?: string) => { document.execCommand(c, false, arg); ref.current && setHtml(ref.current.innerHTML); };
  const tbcCount = (html.match(/\[TBC\]/g) ?? []).length;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Link href={`/admin/stories`} className="text-xs text-silver no-underline">← Stories</Link><h2 className="text-xl">{post ? 'Edit story' : 'New story'}</h2>{post && <span className={`pill-status ${post.status === 'published' ? 'pos' : post.status === 'scheduled' ? 'warn' : 'muted'}`}>{post.status}</span>}</div>
          {post && <PreviewButton brand={brand} path={`/stories/${post.slug}?id=${post.id}`} label="Preview" />}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col sm:col-span-2"><label className="field-label" htmlFor="st-title">Title</label><input id="st-title" className="input text-base" value={title} onChange={(e) => { setTitle(e.target.value); if (!post && (!slug || slug === slugify(title))) setSlug(slugify(e.target.value)); }} /></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="st-slug">Address</label><div className="flex items-center gap-1"><span className="mono text-xs text-silver">/stories/</span><input id="st-slug" className="input mono text-xs" value={slug} onChange={(e) => setSlug(e.target.value)} /></div></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="st-type">Type</label><select id="st-type" className="input text-sm" value={type} onChange={(e) => setType(e.target.value)}><option>Announcement</option><option>Feature</option></select></div>
          <div className="flex flex-col sm:col-span-2"><label className="field-label" htmlFor="st-ex">Summary (shown in lists and as the search description)</label><textarea id="st-ex" rows={2} className="input text-sm" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} /></div>
        </div>
        <div className="flex flex-col">
          <span className="field-label">Body</span>
          <div className="flex flex-wrap gap-1 border border-b-0 border-hairline p-1">
            {[['bold', 'B'], ['italic', 'I'], ['insertUnorderedList', '• List'], ['insertOrderedList', '1. List']].map(([c, l]) => <button key={c} type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); cmd(c); }}>{l}</button>)}
            <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); cmd('formatBlock', 'h3'); }}>H3</button>
            <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); cmd('formatBlock', 'p'); }}>¶</button>
            <button type="button" className="btn-ghost btn-sm" onMouseDown={(e) => { e.preventDefault(); const u = prompt('Link URL'); if (u) cmd('createLink', u); }}>Link</button>
          </div>
          <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Story body" className="input min-h-[320px] text-sm" style={{ whiteSpace: 'normal' }} onInput={() => ref.current && setHtml(ref.current.innerHTML)} onBlur={() => ref.current && setHtml(ref.current.innerHTML)} />
          {tbcCount > 0 && <span className="mt-1 text-xs text-[#8a6d1f]">{tbcCount} “[TBC]” in the body. Confirm before publishing.</span>}
        </div>
      </section>
      <aside className="flex flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <div className="card-head"><h3>Publish</h3></div>
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => save('draft')}>Save draft</button>
          {canPublish && (
            <>
              <button type="button" className="btn-gold btn-sm" disabled={pending} onClick={() => save('publish')}>{post?.status === 'published' ? 'Update live story' : 'Publish now'}</button>
              <div className="flex flex-col"><label className="field-label" htmlFor="st-when">Or schedule (Toronto time)</label><div className="flex gap-1"><input id="st-when" type="datetime-local" className="input text-xs" value={when} onChange={(e) => setWhen(e.target.value)} /><button type="button" className="btn-ghost btn-sm" disabled={pending || !when} onClick={() => save('schedule')}>Schedule</button></div></div>
            </>
          )}
          {!canPublish && <p className="text-xs text-silver">Writers save drafts; an editor publishes.</p>}
          {msg && <p className="text-xs text-silver">{msg}</p>}
          {post && <form action={async (fd) => { if (confirm('Delete this story?')) await deletePostAction(fd); }}><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={post.id} /><button type="submit" className="btn-ghost btn-sm">Delete</button></form>}
        </section>
        <section className="card flex flex-col gap-3 p-4">
          <div className="card-head"><h3>Details</h3></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="st-loc">Location</label><select id="st-loc" className="input text-sm" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">All locations</option>{locations.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}</select></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="st-sport">Sport</label><select id="st-sport" className="input text-sm" value={sport} onChange={(e) => setSport(e.target.value)}><option value="">All sports</option><option value="basketball">Basketball</option><option value="volleyball">Volleyball</option><option value="soccer">Soccer</option><option value="flag-football">Flag Football</option></select></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="st-prog">Related program</label><select id="st-prog" className="input text-sm" value={prog} onChange={(e) => setProg(e.target.value)}><option value="">None</option>{programs.map((p) => <option key={p.slug} value={p.slug}>{p.name} · {locations.find((l) => l.slug === p.locationSlug)?.name ?? p.locationSlug}</option>)}</select></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="st-author">By</label><input id="st-author" className="input text-sm" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Defaults to the site name" /></div>
          <div className="flex flex-col"><label className="field-label" htmlFor="st-cover">Cover photo</label><select id="st-cover" className="input text-xs" value={cover} onChange={(e) => { setCover(e.target.value); const m = images.find((i) => i.url === e.target.value); if (m && !coverAlt) setCoverAlt(m.alt); }}><option value="">None</option>{images.map((m) => <option key={m.url} value={m.url}>{m.name}</option>)}</select></div>
          {cover && <><div className="flex flex-col"><label className="field-label" htmlFor="st-alt">Cover alt text</label><input id="st-alt" className="input text-sm" value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} /></div><div className="flex flex-col"><label className="field-label" htmlFor="st-credit">Credit</label><input id="st-credit" className="input text-sm" value={coverCredit} onChange={(e) => setCoverCredit(e.target.value)} /></div></>}
        </section>
        <section className="card flex flex-col gap-3 p-4">
          <div className="card-head"><h3>Draft with Claude</h3></div>
          <textarea rows={3} className="input text-sm" placeholder="What's the story? e.g. Orangeville basketball registration opens March 1" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" />
          <button type="button" className="btn-ghost btn-sm self-start" disabled={pending || topic.trim().length < 5} onClick={() => start(async () => { const r = await draftStoryAction(brand, { topic, locationSlug: loc || undefined, programSlug: prog || undefined }); if (!title) { setTitle(r.title); setSlug(slugify(r.title)); } if (!excerpt) setExcerpt(r.excerpt); setHtml(r.blocks.map((b) => String(b.props.html ?? '')).join('')); setTbc(r.tbc); setMsg(r.source === 'fallback' ? 'Claude is not connected; a placeholder draft was written from the records.' : 'Draft written from the records. Review it before publishing.'); })}>{pending ? 'Writing…' : 'Write a draft'}</button>
          {tbc > 0 && <p className="text-xs text-[#8a6d1f]">{tbc} fact{tbc === 1 ? '' : 's'} marked [TBC].</p>}
          <p className="text-xs text-silver">Uses the location and program records. Nothing is published until you say so.</p>
        </section>
      </aside>
    </div>
  );
}
