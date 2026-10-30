import Link from 'next/link';
import type { SiteLocation, SiteProgram } from '@/lib/site/records';
import { programStatusLabel, programLinePath } from '@/lib/site/records';
import { FactsDl, StatusPill, T } from '@/components/site/ui';
import LeadForm from '@/components/site/LeadForm';
import type { RenderCtx } from '@/components/site/blocks/BlockRenderer';

/**
 * One program as a block (ALL CAN §4.4): kicker, name, status pill, the fact
 * block in its fixed order, a financial-assistance line beside the price, and
 * on the right the interest form while registration is closed (or the
 * Circuit details link for the rep program). When Module 4 registration is
 * connected the right column becomes the Register action; until then an
 * external registration link (Playbook) does the same job in a new tab.
 */
export default function ProgramBlock({ program, location, ctx, primary }: { program: SiteProgram; location: SiteLocation | null; ctx: RenderCtx; primary?: boolean }) {
  const st = programStatusLabel(program);
  const isRep = program.leagueType === 'Rep';
  return (
    <article className="prog" id={program.slug}>
      <div className="prog-head">
        <div>
          <p className="kicker">{program.leagueType} · {location?.name ?? program.locationSlug}</p>
          <h2 style={{ marginTop: 6 }}>{program.name}.</h2>
        </div>
        <StatusPill label={st.label} live={st.live} />
      </div>
      <div className="grid" style={{ rowGap: 24 }}>
        <div className="left">
          <FactsDl facts={program.facts} preview={ctx.preview} />
          {program.description && <p style={{ marginTop: 14 }}><T preview={ctx.preview}>{program.description}</T></p>}
          {!isRep && <p style={{ marginTop: 12 }}><Link href={programLinePath(program.sport, program.leagueType)}>About {program.name}</Link></p>}
          <p className="note" style={{ marginTop: 12 }}>Financial help is available. <Link href="/financial-assistance">See financial assistance</Link>.</p>
        </div>
        <div className="right">
          {isRep ? (
            <>
              <p><T preview={ctx.preview}>Selection and tryout details are [TBC].</T></p>
              <div style={{ marginTop: 16 }}><Link className={`pill ${primary ? 'pill--red' : 'pill--ink'}`} href="/circuit">Circuit details</Link></div>
            </>
          ) : program.status === 'open' && program.programId ? (
            <div><Link className="pill pill--red" href={`/programs/${program.programId}`}>Register</Link></div>
          ) : program.status === 'open' && program.registerUrl ? (
            <div className="reg">
              <a className="pill pill--red" href={program.registerUrl} target="_blank" rel="noopener">Register now<span className="chev" aria-hidden="true" /></a>
              <p className="note" style={{ marginTop: 12 }}>Opens our registration partner in a new tab. Create a family account, add your player and choose this program.</p>
            </div>
          ) : (
            <LeadForm brandKey={ctx.brandKey} variant="interest" context={program.name} siteName={ctx.site.name} />
          )}
        </div>
      </div>
    </article>
  );
}
