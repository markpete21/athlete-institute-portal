-- Hide Financial assistance for now (owner, Nov 2 2026). The page is
-- unpublished (its draft is kept, so it can return) and noindexed; the menu
-- link stays hidden; every mention and link on public pages is removed.
-- Idempotent.

update public.site_pages set blocks_published = null, published_at = null, hidden_from_menu = true,
  seo = seo || '{"noindex": true}'::jsonb, updated_at = now()
 where brand_key = 'all-can' and (template = 'financial-assistance' or slug = 'financial-assistance');

update public.site_nav_items set visible = false, updated_at = now()
 where brand_key = 'all-can' and href = '/financial-assistance';

-- Toronto Midtown basketball: the key-facts note, the mid-page button and the FAQ note
update public.site_pages set
  blocks_draft = replace(replace(replace(blocks_draft::text,
      ' Financial help is available.', ''),
      ', {"href": "/financial-assistance", "label": "Financial assistance", "style": "line"}', ''),
      '"note": "Financial help is available. See financial assistance."', '"note": ""')::jsonb,
  blocks_published = case when blocks_published is null then null else replace(replace(replace(blocks_published::text,
      ' Financial help is available.', ''),
      ', {"href": "/financial-assistance", "label": "Financial assistance", "style": "line"}', ''),
      '"note": "Financial help is available. See financial assistance."', '"note": ""')::jsonb end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown/basketball';
