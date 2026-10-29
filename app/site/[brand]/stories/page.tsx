import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead, Section } from '@/components/site/ui';
import { siteContext } from '@/lib/site/context';
import { publishedPosts } from '@/lib/site/posts';
import { getPageBySlug } from '@/lib/site/pages';
import { pageDescription, pageTitle } from '@/lib/site/seo';
import { fmtDay } from '@/lib/site/context';
import { listLocations } from '@/lib/site/records';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { brand: string } }): Promise<Metadata> {
  const ctx = await siteContext(params.brand);
  const page = ctx && (await getPageBySlug(params.brand, 'stories'));
  if (!ctx || !page) return {};
  return { title: { absolute: pageTitle(ctx.site, page) }, description: pageDescription(ctx.site, page), alternates: { canonical: `${ctx.origin}/stories` } };
}

/** Stories list (ALL CAN §4.9): type filter, newest first, each row with type, date, location, title and summary. */
export default async function StoriesPage({ params, searchParams }: { params: { brand: string }; searchParams: { type?: string } }) {
  const ctx = await siteContext(params.brand);
  if (!ctx) notFound();
  const type = searchParams.type === 'Announcement' || searchParams.type === 'Feature' ? searchParams.type : '';
  const [posts, locs] = await Promise.all([publishedPosts(params.brand, { type: type || undefined }), listLocations(params.brand)]);
  return (
    <>
      <PageHead kicker="Stories" title="Stories." lede="Announcements and features from every location." crumbs={[['Home', '/'], ['Stories', '']]} />
      <Section tight>
        <div className="tabs" role="group" aria-label="Story type">
          {[['', 'All'], ['Announcement', 'Announcements'], ['Feature', 'Features']].map(([k, l]) => <Link key={k} href={k ? `/stories?type=${k}` : '/stories'} className="tab" aria-current={type === k ? 'page' : undefined} role="button" aria-pressed={type === k}>{l}</Link>)}
        </div>
        {posts.map((s) => (
          <Link key={s.id} className="story" href={`/stories/${s.slug}`}>
            <div className="m">{s.type}<br />{s.publishedAt ? fmtDay(s.publishedAt) : ''}{s.locationSlug ? ` · ${locs.find((l) => l.slug === s.locationSlug)?.name ?? s.locationSlug}` : ' · All locations'}</div>
            <div><h3>{s.title}</h3>{s.excerpt && <p className="muted" style={{ marginTop: 6, fontSize: 15 }}>{s.excerpt}</p>}</div>
          </Link>
        ))}
        {posts.length === 0 && <p className="muted">No stories yet.</p>}
      </Section>
    </>
  );
}
