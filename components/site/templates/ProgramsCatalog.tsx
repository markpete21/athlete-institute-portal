import Link from 'next/link';
import type { SitePage } from '@/lib/site/pages';
import type { BrandSite } from '@/lib/site/sites';
import { listPublicPrograms } from '@/lib/programs/catalog';
import { formatCAD } from '@ai/foundation';
import BlockRenderer from '@/components/site/blocks/BlockRenderer';
import { Chev, PageHead, Section, StatusPill } from '@/components/site/ui';

const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? 'https://play.athleteinstitute.ca';

/**
 * /programs on any brand site (Module 23 §3): every Module 4 program with this
 * brand_key in a public status, grouped by type, with price, ages, spots and
 * the register action. Registration itself runs on Play until the brand-host
 * checkout stage lands (owner decision: not in the ALL CAN launch build), so
 * the action links out with the program's share token.
 */
export async function ProgramsCatalog({ ctx, page }: { ctx: { site: BrandSite; brandKey: string; preview: boolean }; page: SitePage | null }) {
  const items = await listPublicPrograms({ brandKey: ctx.brandKey });
  const groups = new Map<string, typeof items>();
  for (const it of items) groups.set(it.type_name, [...(groups.get(it.type_name) ?? []), it]);
  const blocks = page ? (ctx.preview ? page.blocksDraft : page.blocksPublished ?? []) : [];
  return (
    <>
      <PageHead kicker="Programs" title="Programs." lede="Every program open for registration, with live dates, prices and spots." crumbs={[['Home', '/'], ['Programs', '']]} />
      <Section tight>
        {items.length === 0 && <p className="muted">No programs are open for registration right now. Find your location to get notified when they open.</p>}
        {[...groups.entries()].map(([type, list]) => (
          <div key={type} style={{ marginBottom: 40 }}>
            <h3 style={{ margin: '8px 0 10px' }}>{type}.</h3>
            <div className="rows">
              {list.map((p) => (
                <Link key={p.id} className="row" href={`/programs/${p.id}`}>
                  <h3>{p.name}</h3>
                  <span className="meta">{p.min_age || p.max_age ? `Ages ${p.min_age ?? ''}–${p.max_age ?? ''} · ` : ''}{formatCAD(p.base_price_cents)}{p.spots_left != null ? ` · ${p.spots_left > 0 ? `${p.spots_left} spots left` : 'Full'}` : ''}</span>
                  <span className="end"><StatusPill label={p.status === 'registration_open' ? 'Open' : p.status === 'full' ? 'Full' : 'Coming soon'} live={p.status === 'registration_open'} /><Chev /></span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </Section>
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </>
  );
}

export async function ProgramDetail({ ctx, id }: { ctx: { site: BrandSite; brandKey: string; preview: boolean }; id: number }) {
  const items = await listPublicPrograms({ brandKey: ctx.brandKey });
  const p = items.find((x) => x.id === id);
  if (!p) return null;
  const open = p.status === 'registration_open';
  return (
    <>
      <PageHead kicker={p.type_name} title={`${p.name}.`} lede={p.description ?? ''} crumbs={[['Home', '/'], ['Programs', '/programs'], [p.name, '']]} />
      <Section tight>
        <article className="prog">
          <div className="grid" style={{ rowGap: 24 }}>
            <div className="left">
              <dl className="facts">
                {(p.min_age || p.max_age) && <div><dt>Ages</dt><dd>{p.min_age ?? ''}–{p.max_age ?? ''}</dd></div>}
                <div><dt>Price</dt><dd>{formatCAD(p.base_price_cents)} + tax</dd></div>
                <div><dt>Spots</dt><dd>{p.spots_left == null ? 'Open' : p.spots_left > 0 ? `${p.spots_left} left` : 'Full · waitlist'}</dd></div>
                <div><dt>Status</dt><dd>{open ? 'Registration open' : p.status === 'full' ? 'Full' : 'Registration not open yet'}</dd></div>
              </dl>
              <p className="note" style={{ marginTop: 12 }}>Financial help is available. <Link href="/financial-assistance">See financial assistance</Link>.</p>
            </div>
            <div className="right">
              <a className={`pill ${open ? 'pill--red' : 'pill--ink'}`} href={`${ctx.site.links.play_url ?? PLAY_URL}/p/${p.share_token}`}>{open ? 'Register on Play. App' : p.status === 'full' ? 'Join the waitlist' : 'View on Play. App'}</a>
              <p className="note" style={{ marginTop: 12 }}>Registration and payment run on Play. App with your Athlete Institute account.</p>
            </div>
          </div>
        </article>
      </Section>
    </>
  );
}
