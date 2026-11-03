-- Toronto Midtown Youth League price (owner, Nov 2 2026): $325 + HST for the
-- season (was $350 + HST): $367.25 with HST, about $41 a Saturday over 8.
-- Program record, the Toronto basketball page (draft and published) and its
-- search description. Playbook is updated separately. Idempotent.

update public.site_programs set
  facts = replace(replace(replace(replace(facts::text, '$350', '$325'), '$395.50', '$367.25'), 'About $44', 'About $41'), 'about $44', 'about $41')::jsonb,
  description = case when description is null then null else replace(replace(replace(replace(description, '$350', '$325'), '$395.50', '$367.25'), 'About $44', 'About $41'), 'about $44', 'about $41') end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league';

update public.site_pages set
  blocks_draft = replace(replace(replace(replace(blocks_draft::text, '$350', '$325'), '$395.50', '$367.25'), 'About $44', 'About $41'), 'about $44', 'about $41')::jsonb,
  blocks_published = case when blocks_published is null then null else replace(replace(replace(replace(blocks_published::text, '$350', '$325'), '$395.50', '$367.25'), 'About $44', 'About $41'), 'about $44', 'about $41')::jsonb end,
  seo = replace(replace(replace(replace(seo::text, '$350', '$325'), '$395.50', '$367.25'), 'About $44', 'About $41'), 'about $44', 'about $41')::jsonb,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown/basketball';
