import { notFound } from 'next/navigation';
import { getPage, listPages } from '@/lib/site/pages';
import { getSite, siteOrigin } from '@/lib/site/sites';
import { listLocations, listPrograms } from '@/lib/site/records';
import { listMedia } from '@/lib/site/media';
import { listDivisions } from '@/lib/compete/compete';
import { recordSources } from '@/lib/site/claude';
import { pageIssues, pageTitle, pageDescription } from '@/lib/site/seo';
import { getPortalSession } from '@/lib/auth';
import { canPublish, siteRoleFor } from '@/lib/site/scopes';
import { PageBuilder } from './PageBuilder';

export const dynamic = 'force-dynamic';

/** The page builder (Module 23 §2.4): block list, inspector, Claude, SEO panel, save/publish, preview. */
export default async function PageEditor({ params, searchParams }: { params: { brand: string; id: string }; searchParams: { panel?: string } }) {
  const brand = params.brand;
  const [site, page, role] = await Promise.all([getSite(brand), getPage(brand, Number(params.id)), siteRoleFor(await getPortalSession(), brand)]);
  if (!site || !page || !role) notFound();
  const [pages, locs, progs, media, divisions, sources] = await Promise.all([listPages(brand), listLocations(brand), listPrograms(brand), listMedia(brand), listDivisions(brand).catch(() => []), recordSources(brand)]);
  return (
    <PageBuilder
      brand={brand}
      page={{ id: page.id, title: page.title, slug: page.slug, kind: page.kind, template: page.template, state: page.state, blocks: page.blocksDraft, hiddenFromMenu: page.hiddenFromMenu, seo: page.seo, updatedAt: page.updatedAt, publishedAt: page.publishedAt }}
      seo={{ computedTitle: pageTitle(site, page), computedDescription: pageDescription(site, page), issues: pageIssues(site, page, pages), keywords: site.seo.keywords ?? [], siteName: site.name }}
      canPublish={canPublish(role)}
      canDelete={role !== 'writer' && page.kind === 'custom'}
      origin={siteOrigin(site)}
      initialPanel={searchParams.panel === 'seo' ? 'seo' : 'blocks'}
      refs={{
        locations: locs.map((l) => ({ slug: l.slug, name: l.name })),
        programs: progs.map((p) => ({ slug: p.slug, name: p.name, locationSlug: p.locationSlug })),
        media: media.filter((m) => m.kind === 'photo' || m.kind === 'logo').map((m) => ({ url: m.url, name: m.name, alt: m.alt ?? '' })),
        divisions: divisions.map((d) => ({ id: d.id, name: d.name })),
        pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
        sources: sources.map((s) => ({ key: s.key, label: s.label })),
      }}
    />
  );
}
