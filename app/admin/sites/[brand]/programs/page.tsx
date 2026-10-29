import { listLocations, listPrograms, SPORTS, type SiteProgram } from '@/lib/site/records';
import { listPublicPrograms } from '@/lib/programs/catalog';
import { deleteProgramAction, saveProgramAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';

export const dynamic = 'force-dynamic';

/**
 * Program records (ALL CAN §6.3): the fact blocks on location and sport pages.
 * Facts are typed in for now (the owner decided registration data is not
 * pulled from Play yet); linking a Play program id makes the Register button
 * live when that program opens.
 */
export default async function ProgramsAdmin({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  const [progs, locs, play] = await Promise.all([listPrograms(brand, { includeArchived: true }), listLocations(brand), listPublicPrograms({ brandKey: brand }).catch(() => [])]);
  return (
    <div className="flex flex-col gap-5">
      {progs.map((p) => <ProgramForm key={p.id} brand={brand} prog={p} locs={locs} play={play} />)}
      <details className="card p-5">
        <summary className="cursor-pointer text-base font-extrabold">+ Add a program</summary>
        <div className="mt-4"><ProgramForm brand={brand} prog={null} locs={locs} play={play} /></div>
      </details>
    </div>
  );
}

function ProgramForm({ brand, prog, locs, play }: { brand: string; prog: SiteProgram | null; locs: { slug: string; name: string }[]; play: { id: number; name: string }[] }) {
  const k = prog?.id ?? 'new';
  const tbc = prog?.facts.filter((f) => f[1].includes('[TBC]')).length ?? 0;
  return (
    <form action={saveProgramAction} className={prog ? 'card flex flex-col gap-4 p-5' : 'flex flex-col gap-4'}>
      <input type="hidden" name="brand" value={brand} />{prog && <input type="hidden" name="id" value={prog.id} />}
      {prog && <div className="card-head"><h2>{prog.name}</h2><span className="card-head-lbl">{locs.find((l) => l.slug === prog.locationSlug)?.name ?? prog.locationSlug} · {prog.sport}</span>{tbc > 0 && <span className="pill-status warn ml-auto">{tbc} fact{tbc === 1 ? '' : 's'} [TBC]</span>}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-name`}>Name</label><input id={`p-${k}-name`} name="name" defaultValue={prog?.name ?? ''} className="input text-sm" required /></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-loc`}>Location</label><select id={`p-${k}-loc`} name="locationSlug" defaultValue={prog?.locationSlug ?? locs[0]?.slug} className="input text-sm">{locs.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}</select></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-sport`}>Sport</label><select id={`p-${k}-sport`} name="sport" defaultValue={prog?.sport ?? 'basketball'} className="input text-sm">{SPORTS.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-type`}>Type</label><select id={`p-${k}-type`} name="leagueType" defaultValue={prog?.leagueType ?? 'league'} className="input text-sm"><option value="league">League</option><option value="skills">Skills</option><option value="circuit">Circuit</option><option value="camp">Camp</option><option value="training">Training</option></select></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-status`}>Status</label><select id={`p-${k}-status`} name="status" defaultValue={prog?.status ?? 'coming_soon'} className="input text-sm"><option value="open">Open</option><option value="coming_soon">Coming soon</option><option value="full">Full</option><option value="closed">Closed</option><option value="archived">Archived</option></select></div>
        <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-sl`}>Status label</label><input id={`p-${k}-sl`} name="statusLabel" defaultValue={prog?.statusLabel ?? ''} className="input text-sm" placeholder="e.g. Registration opens Sept 1" /></div>
        <div className="flex flex-col sm:col-span-2 lg:col-span-3"><label className="field-label" htmlFor={`p-${k}-desc`}>Description</label><textarea id={`p-${k}-desc`} name="description" rows={2} defaultValue={prog?.description ?? ''} className="input text-sm" /></div>
        <div className="flex flex-col sm:col-span-2"><label className="field-label" htmlFor={`p-${k}-facts`}>Facts</label><textarea id={`p-${k}-facts`} name="facts" rows={7} defaultValue={(prog?.facts ?? [['Ages', '[TBC]'], ['Season', '[TBC]'], ['Days', '[TBC]'], ['Price', '[TBC]']]).map((f) => f.join(' | ')).join('\n')} className="input mono text-xs" /><span className="mt-1 text-xs text-silver">One per line: Label | Value. Leave [TBC] where a fact isn&apos;t confirmed; the live site shows “To be confirmed”.</span></div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-play`}>Play program</label><select id={`p-${k}-play`} name="programId" defaultValue={prog?.programId ?? ''} className="input text-sm"><option value="">Not linked yet</option>{play.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="mt-1 text-xs text-silver">Makes Register live when it opens.</span></div>
          <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-slug`}>Slug</label><input id={`p-${k}-slug`} name="slug" defaultValue={prog?.slug ?? ''} className="input text-sm" /></div>
          <div className="flex flex-col"><label className="field-label" htmlFor={`p-${k}-sort`}>Order</label><input id={`p-${k}-sort`} name="sortOrder" defaultValue={String(prog?.sortOrder ?? 100)} className="input text-sm" /></div>
        </div>
      </div>
      <div className="flex gap-2"><SubmitButton className="btn-gold btn-sm">{prog ? 'Save program' : 'Create program'}</SubmitButton>
        {prog && <SubmitButton className="btn-ghost btn-sm" formAction={deleteProgramAction} pendingLabel="Removing…" doneLabel="Removed">Delete</SubmitButton>}</div>
    </form>
  );
}
