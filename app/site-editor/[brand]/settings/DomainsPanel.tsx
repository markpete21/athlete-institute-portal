'use client';

import { useState, useTransition } from 'react';
import { saveSettingsAction, verifyDnsAction } from '../../actions';

/** Domains + Verify DNS (Module 23 §2.9): hostnames, primary host, the records to add at the registrar, a live check. */
export function DomainsPanel({ brand, hostnames, primaryHost, status, satellite }: { brand: string; hostnames: string[]; primaryHost: string | null; status: string; satellite: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ host: string; records: string[]; ok: boolean; want: string }[] | null>(null);
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="card-head"><h2>Domains</h2><span className="card-head-lbl">{status === 'live' ? 'Live' : 'Not live yet'}</span></div>
      <form action={async (fd) => { await saveSettingsAction(fd); }} className="grid gap-3">
        <input type="hidden" name="brand" value={brand} /><input type="hidden" name="section" value="domains" />
        <div className="flex flex-col"><label className="field-label" htmlFor="dm-hosts">Hostnames</label><input id="dm-hosts" name="hostnames" className="input text-sm" defaultValue={hostnames.join(', ')} placeholder="allcansport.ca, www.allcansport.ca" /><span className="mt-1 text-xs text-silver">Comma-separated. Every other host redirects to the primary host.</span></div>
        <div className="flex flex-col"><label className="field-label" htmlFor="dm-primary">Primary host</label><input id="dm-primary" name="primaryHost" className="input text-sm" defaultValue={primaryHost ?? ''} placeholder="allcansport.ca" /><span className="mt-1 text-xs text-silver">Must match the host Vercel keeps (Vercel › Domains: the one the other redirects to). If they disagree, visitors get a redirect loop.</span></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="satellite" defaultChecked={satellite} className="mt-1" /><span>Clerk satellite domain <span className="text-xs text-silver">(paid Clerk plan; add this host under Clerk › Domains › Satellites and the clerk CNAME below). Turns on Sign in, the account button, My teams and Follow this team on this host. Leave off until Clerk shows the satellite as Verified, or visitors get bounced to Play.</span></span></label>
        <div className="flex flex-wrap gap-2"><button type="submit" className="btn-gold btn-sm">Save domains</button>
          <button type="button" className="btn-ghost btn-sm" disabled={pending || hostnames.length === 0} onClick={() => start(async () => setResult(await verifyDnsAction(brand)))}>{pending ? 'Checking…' : 'Verify DNS'}</button></div>
      </form>
      <div className="rounded border border-hairline p-3 text-xs">
        <p className="label mb-1 text-[10px]">Records to add at the registrar</p>
        <table className="data-table text-xs"><thead><tr><th>Type</th><th>Host</th><th>Value</th></tr></thead><tbody>
          <tr><td>A</td><td>@</td><td className="mono">76.76.21.21</td></tr>
          <tr><td>CNAME</td><td>www</td><td className="mono">cname.vercel-dns.com</td></tr>
          <tr><td>CNAME</td><td>clerk</td><td className="mono">the target Clerk shows under Domains › Satellites › DNS configuration</td></tr>
        </tbody></table>
        <p className="mt-2 text-silver">Then add the same hostnames to the Vercel project (Domains) so the certificate is issued. The clerk record is only for the Clerk satellite. Propagation can take up to an hour (Clerk says up to 48).</p>
      </div>
      {result && (
        <ul className="flex flex-col gap-1 text-sm">{result.map((r) => <li key={r.host} className="flex items-center gap-2"><span className={`pill-status ${r.ok ? 'pos' : 'warn'}`}>{r.ok ? 'OK' : 'Not yet'}</span><span className="mono text-xs">{r.host}</span><span className="text-silver">{r.records.length ? `→ ${r.records.join(', ')}` : 'no record found'}{!r.ok ? ` (want ${r.want})` : ''}</span></li>)}</ul>
      )}
    </section>
  );
}
