import Link from 'next/link';
import { BRANDS } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { listSeasons } from '@/lib/seasons/seasons';
import { createDivisionAction, createStandaloneEventAction, duplicateStandaloneEventAction, saveLocationDisplayAction } from './actions';

export const dynamic = 'force-dynamic';

const COMPETE_URL = process.env.NEXT_PUBLIC_COMPETE_URL ?? 'https://compete.athleteinstitute.ca';

/** Competitive Play admin: divisions per program (Module 6 Stage 1). */
export default async function CompetitivePage() {
  const db = supabaseAdmin();
  const [{ data: divisions }, { data: programs }, { data: standalone }, { data: locations }, { data: locSettings }, seasons] = await Promise.all([
    db.from('divisions').select('id, name, sport, programs(name)').order('id', { ascending: false }),
    db.from('programs').select('id, name').in('status', ['draft', 'published', 'registration_open', 'full']).order('name'),
    db.from('programs').select('id, name, season_key, tournament_mode, tickets_url').eq('compete_only', true).order('id', { ascending: false }),
    db.from('locations').select('id, name').order('id'),
    db.from('compete_location_settings').select('location_id, layout_mode, welcome'),
    listSeasons(),
  ]);
  const locCfg = new Map((locSettings ?? []).map((l) => [l.location_id, l]));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2 border-b border-hairline pb-6">
        <p className="label text-[11px]">Admin · Competitive Play</p>
        <h1 className="text-5xl">Competition<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body">Divisions, team builder, schedule builder, score entry, standings.</p>
      </header>

      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">New division</h2>
        <form action={createDivisionAction} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><label className="field-label">Program</label>
            <select name="programId" required className="input">{(programs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div><label className="field-label">Name</label><input name="name" required placeholder="U14 Div A" className="input" /></div>
          <div><label className="field-label">Sport</label>
            <select name="sport" className="input"><option value="basketball">Basketball</option><option value="volleyball">Volleyball</option><option value="other">Other</option></select>
          </div>
          <div className="flex gap-2">
            <div><label className="field-label">Max teams</label><input name="maxTeams" type="number" className="input w-20" /></div>
            <div><label className="field-label">Min/team</label><input name="minPlayers" type="number" className="input w-20" /></div>
            <div><label className="field-label">Max/team</label><input name="maxPlayers" type="number" className="input w-20" /></div>
          </div>
          <div className="flex items-end"><button type="submit" className="btn-gold">Create</button></div>
        </form>
      </section>

      {/* Standalone Compete events — hosted/outside leagues & tournaments
          with no Play registration behind them (migration 0057). */}
      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">Standalone Compete events</h2>
        <p className="text-body max-w-[66ch] text-sm">
          Lives only on the public competitive site: teams, schedules and scores are managed
          here, with no Play registration, rosters or payments behind it. Perfect for hosted
          events or an outside organization&apos;s tournament. Creating one lands on its program
          page for branding; add divisions with the form above.
        </p>
        <form action={createStandaloneEventAction} className="flex flex-wrap items-end gap-3">
          <div><label className="field-label">Name</label><input name="name" required placeholder="Hoopfest Ontario Qualifier" className="input w-64" /></div>
          <div className="flex items-end gap-3 pb-2">
            <label className="flex items-center gap-1 font-mono text-[11px] uppercase text-silver"><input type="radio" name="kind" value="league" defaultChecked /> League</label>
            <label className="flex items-center gap-1 font-mono text-[11px] uppercase text-silver"><input type="radio" name="kind" value="tournament" /> Tournament</label>
          </div>
          <div><label className="field-label">Season</label>
            <select name="seasonKey" className="input text-sm" defaultValue="">
              <option value="">— none —</option>
              {seasons.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="field-label">Brand</label>
            <select name="brandKey" className="input text-sm" defaultValue="athlete-institute">
              {BRANDS.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-gold btn-sm">Create &amp; open branding →</button>
        </form>
        {(standalone ?? []).length > 0 && (
          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            {(standalone ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-ink">{p.name}</span>
                <span className="tag">{p.tournament_mode ? 'tournament' : 'league'}</span>
                {p.season_key && <span className="tag">{seasons.find((s) => s.key === p.season_key)?.name ?? p.season_key}</span>}
                {p.tickets_url && <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>tickets</span>}
                <span className="ml-auto flex gap-2">
                  <form action={duplicateStandaloneEventAction}>
                    <input type="hidden" name="programId" value={p.id} />
                    <button type="submit" className="btn-ghost btn-sm" title="Copies brand, sponsors, divisions and team shells — games and rosters start empty; divisions land unpublished.">Duplicate</button>
                  </form>
                  <Link href={`/programs/${p.id}`} className="btn-ghost btn-sm">Program ↗</Link>
                  <a href={`${COMPETE_URL}/p/${p.id}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Landing ↗</a>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Per-location Compete display (migration 0057). One location today —
          the switcher on the public site appears once a second row exists. */}
      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-2xl">Compete display by location</h2>
        <p className="text-body max-w-[66ch] text-sm">
          How each location&apos;s Compete front page renders. Auto keeps small locations simple
          (league list) and flips to the full catalogue at 8 published divisions; the welcome
          message shows as a banner above the leagues.
        </p>
        {(locations ?? []).map((loc) => {
          const cfg = locCfg.get(loc.id);
          return (
            <form key={loc.id} action={saveLocationDisplayAction} className="flex flex-wrap items-end gap-3 border-t border-hairline pt-3">
              <input type="hidden" name="locationId" value={loc.id} />
              <span className="text-ink min-w-40 pb-2 text-sm font-semibold">{loc.name}</span>
              <div><label className="field-label">Layout</label>
                <select name="layoutMode" defaultValue={cfg?.layout_mode ?? 'auto'} className="input text-sm">
                  <option value="auto">Auto</option>
                  <option value="full">Full catalogue</option>
                  <option value="simple">Simple — list the leagues</option>
                </select>
              </div>
              <div className="min-w-72 flex-1"><label className="field-label">Welcome message</label>
                <input name="welcome" defaultValue={cfg?.welcome ?? ''} placeholder="Shown above the leagues. Leave empty for none." className="input text-sm" />
              </div>
              <button type="submit" className="btn-ghost btn-sm">Save</button>
            </form>
          );
        })}
      </section>

      <table className="data-table">
        <thead><tr><th>Division</th><th>Program</th><th>Sport</th><th /></tr></thead>
        <tbody>
          {(divisions ?? []).map((d) => (
            <tr key={d.id}>
              <td className="text-ink">{d.name}</td>
              <td>{(d.programs as unknown as { name: string } | null)?.name}</td>
              <td><span className="tag">{d.sport}</span></td>
              <td><Link href={`/competitive/${d.id}`} className="btn-ghost btn-sm">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
