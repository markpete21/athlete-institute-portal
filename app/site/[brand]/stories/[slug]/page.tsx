import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BlockRenderer from '@/components/site/blocks/BlockRenderer';
import { FactsDl, PageHead } from '@/components/site/ui';
import { siteContext, fmtDay } from '@/lib/site/context';
import { getPostAdmin, publicPost } from '@/lib/site/posts';
import { getLocation, getProgram, sportBySlug } from '@/lib/site/records';
import { breadcrumbJsonLd } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { brand: string; slug: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const post = ctx && (await publicPost(params.brand, params.slug));
  if (!ctx || !post) return {};
  return { title: { absolute: post.seo.title || `${post.title.replace(/\.$/, '')} · ${ctx.site.name}` }, description: post.excerpt ?? undefined, alternates: { canonical: `${ctx.origin}/stories/${post.slug}` }, openGraph: post.coverUrl ? { images: [post.coverUrl] } : undefined };
}

/** One story: facts on the left (date, author, location, sport), body on the right, link to the related program. */
export default async function StoryPage({ params, searchParams }: { params: { brand: string; slug: string }; searchParams: { preview?: string; id?: string } }) {
  const ctx = await siteContext(params.brand, searchParams.preview);
  if (!ctx) notFound();
  let post = await publicPost(params.brand, params.slug);
  if (!post && ctx.preview && searchParams.id) post = await getPostAdmin(params.brand, Number(searchParams.id));
  if (!post) notFound();
  const [loc, prog] = await Promise.all([post.locationSlug ? getLocation(params.brand, post.locationSlug) : null, post.programSlug ? getProgram(params.brand, post.programSlug) : null]);
  const rctx = { site: ctx.site, brandKey: ctx.site.brandKey, preview: ctx.preview };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(ctx.origin, [['Home', '/'], ['Stories', '/stories'], [post.title, `/stories/${post.slug}`]])) }} />
      <PageHead kicker={`${post.type} · ${loc?.name ?? 'All locations'}`} title={post.title} lede={post.excerpt} crumbs={[['Home', '/'], ['Stories', '/stories'], [post.title.replace(/\.$/, ''), '']]} preview={ctx.preview} />
      {post.coverUrl && (
        <div className="wrap" style={{ marginTop: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <figure className="fig"><img src={post.coverUrl} alt={post.coverAlt ?? ''} style={{ width: '100%', height: 'auto', display: 'block' }} />{post.coverCredit && <figcaption className="note">Photo {post.coverCredit}</figcaption>}</figure>
        </div>
      )}
      <section className="sec" style={{ paddingTop: 36 }}><div className="wrap"><div className="grid">
        <div className="left"><FactsDl preview={ctx.preview} facts={[['Date', post.publishedAt ? fmtDay(post.publishedAt) : '[TBC]'], ['By', post.authorLabel ?? ctx.site.name], ['Location', loc?.name ?? 'All locations'], ['Sport', post.sport ? sportBySlug(post.sport)?.name ?? post.sport : 'All sports']]} /></div>
        <div className="right story-body" style={{ display: 'grid', gap: 16 }}>
          <StoryBody blocks={post.body} ctx={rctx} />
          {prog && <p><Link href={`/${prog.locationSlug}/${prog.sport}#${prog.slug}`}>{prog.name} at {loc?.name ?? prog.locationSlug}</Link></p>}
        </div>
      </div></div></section>
    </>
  );
}

/** Story bodies are rich_text blocks rendered without section chrome. */
async function StoryBody({ blocks, ctx }: { blocks: import('@/lib/site/blocks').Block[]; ctx: { site: import('@/lib/site/sites').BrandSite; brandKey: string; preview: boolean } }) {
  const simple = blocks.every((b) => b.type === 'rich_text');
  if (simple) return <>{blocks.map((b) => <div key={b.id} className="rich" dangerouslySetInnerHTML={{ __html: String(b.props.html ?? '').replace(/\[TBC\]/g, `<em class="tbc">${ctx.preview ? '[TBC]' : 'To be confirmed'}</em>`) }} />)}</>;
  return <BlockRenderer blocks={blocks} ctx={ctx} />;
}
