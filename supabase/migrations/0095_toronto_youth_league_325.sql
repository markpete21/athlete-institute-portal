-- Toronto Midtown Youth League price (owner, Nov 2 2026): $325 + HST for the
-- season (was $350 + HST), $367.25 with HST. No per-session price: the
-- "Per Saturday" key fact and "about $44 a Saturday" line are removed. Program
-- record, the Toronto basketball page (draft and published) and its search
-- description. Playbook is updated separately. Idempotent, and safe after the
-- earlier version of this file.

update public.site_programs set
  facts = replace(replace(replace(replace(replace(replace(facts::text, ', {"label": "Per Saturday", "value": "About $44 + HST"}', ''), ', {"label": "Per Saturday", "value": "About $41 + HST"}', ''), ', about $44 a Saturday', ''), ', about $41 a Saturday', ''), '$350', '$325'), '$395.50', '$367.25')::jsonb,
  description = case when description is null then null else replace(replace(replace(replace(replace(replace(description, ', {"label": "Per Saturday", "value": "About $44 + HST"}', ''), ', {"label": "Per Saturday", "value": "About $41 + HST"}', ''), ', about $44 a Saturday', ''), ', about $41 a Saturday', ''), '$350', '$325'), '$395.50', '$367.25') end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league';

update public.site_pages set
  blocks_draft = replace(replace(replace(replace(replace(replace(blocks_draft::text, ', {"label": "Per Saturday", "value": "About $44 + HST"}', ''), ', {"label": "Per Saturday", "value": "About $41 + HST"}', ''), ', about $44 a Saturday', ''), ', about $41 a Saturday', ''), '$350', '$325'), '$395.50', '$367.25')::jsonb,
  blocks_published = case when blocks_published is null then null else replace(replace(replace(replace(replace(replace(blocks_published::text, ', {"label": "Per Saturday", "value": "About $44 + HST"}', ''), ', {"label": "Per Saturday", "value": "About $41 + HST"}', ''), ', about $44 a Saturday', ''), ', about $41 a Saturday', ''), '$350', '$325'), '$395.50', '$367.25')::jsonb end,
  seo = replace(replace(replace(replace(replace(replace(seo::text, ', {"label": "Per Saturday", "value": "About $44 + HST"}', ''), ', {"label": "Per Saturday", "value": "About $41 + HST"}', ''), ', about $44 a Saturday', ''), ', about $41 a Saturday', ''), '$350', '$325'), '$395.50', '$367.25')::jsonb,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown/basketball';
