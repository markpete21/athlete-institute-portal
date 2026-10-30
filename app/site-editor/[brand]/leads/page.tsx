import Link from 'next/link';
import { leadCounts, listLeads, type LeadKind } from '@/lib/site/leads';
import { setLeadStatusAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';

export const dynamic = 'force-dynamic';

const KINDS: [LeadKind | '', string][] = [['', 'All'], ['interest', 'Interest'], ['request', 'Location requests'], ['host', 'Host a league'], ['contact', 'Contact'], ['assistance', 'Assistance']];
const fmt = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Leads from every public form, with consent on record and a follow-up status. Export is a CSV link. */
export default async function LeadsPage({ params, searchParams }: { params: { brand: string }; searchParams: { kind?: string } }) {
  const brand = params.brand;
  const kind = (KINDS.find(([k]) => k === searchParams.kind)?.[0] ?? '') as LeadKind | '';
  const [leads, counts] = await Promise.all([listLeads(brand, kind || undefined, 300), leadCounts(brand, 30)]);
  const csv = `data:text/csv;charset=utf-8,${encodeURIComponent(['when,kind,name,email,phone,status,fields,source'].concat(leads.map((l) => [l.createdAt, l.kind, l.name ?? '', l.email, l.phone ?? '', l.status, JSON.stringify(l.fields).replace(/"/g, '""'), l.sourcePath ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\n'))}`;
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="card-head"><h2>Leads</h2><span className="card-head-lbl">{Object.values(counts).reduce((a, b) => a + b, 0)} in the last 30 days</span></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="seg">{KINDS.map(([k, l]) => <Link key={k} href={k ? `/admin/leads?kind=${k}` : `/admin/leads`} className={kind === k ? 'on' : ''}>{l}</Link>)}</nav>
        <a className="btn-ghost btn-sm" href={csv} download={`${brand}-leads.csv`}>Export CSV</a>
      </div>
      {leads.length === 0 ? <p className="text-body text-sm">No leads here yet.</p> : (
        <table className="data-table">
          <thead><tr><th>When</th><th>Kind</th><th>Who</th><th>Details</th><th>Status</th></tr></thead>
          <tbody>{leads.map((l) => (
            <tr key={l.id}>
              <td className="text-silver whitespace-nowrap">{fmt(l.createdAt)}</td>
              <td>{l.kind}</td>
              <td>{l.name || '—'}<br /><a href={`mailto:${l.email}`} className="text-xs">{l.email}</a>{l.phone && <><br /><span className="text-xs text-silver">{l.phone}</span></>}</td>
              <td className="text-xs">{Object.entries(l.fields).filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="text-silver">{k}:</span> {v}</div>)}{l.sourcePath && <div className="mono text-silver">{l.sourcePath}</div>}</td>
              <td><form action={setLeadStatusAction} className="flex items-center gap-1"><input type="hidden" name="brand" value={brand} /><input type="hidden" name="id" value={l.id} />
                <select name="status" defaultValue={l.status} className="input text-xs"><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select><SubmitButton className="btn-ghost btn-sm" pendingLabel="…" doneLabel="Saved">Set</SubmitButton></form></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="text-xs text-silver">Every row has its CASL consent text and time on record. Interest leads get a confirmation email; the site contact gets a copy of each request.</p>
    </section>
  );
}
