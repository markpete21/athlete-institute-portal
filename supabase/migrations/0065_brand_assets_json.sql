-- 0065: brand-assets bucket accepts JSON.
--
-- publishHostsManifest() (lib/site/sites.ts) writes sites/hosts.json to the
-- public brand-assets bucket; middleware reads it for brand-site hosts,
-- redirects and the Clerk satellite list. The bucket was created by hand with
-- image/video MIME types only, so every manifest upload was rejected (the
-- function only warns) and the edge ran on the code seed. Found 2026-10-30
-- when ticking "Clerk satellite domain" for allcansport.ca did nothing.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct t)
  from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['application/json']) as t
)
where id = 'brand-assets' and allowed_mime_types is not null;
