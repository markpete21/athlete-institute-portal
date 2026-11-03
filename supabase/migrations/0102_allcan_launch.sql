-- Launch (owner, Nov 3 2026): make allcansport.ca public.
-- 1. No "To be confirmed" left on public pages: empty photo credits, the coach
--    bio placeholder, the venue Entrance row, the refund FAQs, the Circuit
--    selection line and the Basketball page's age-adapted play rows go.
-- 2. Training and Parent guide (hidden from the menu, still mostly [TBC]) are
--    unpublished and noindexed; their drafts are kept.
-- 3. The site goes live: status live, launched_at set, password gate off, and
--    the brand's site address set (what the editor's launch switch does).

update public.site_pages set
  blocks_draft = replace(replace(replace(replace(replace(blocks_draft::text, '"credit": "[TBC]"', '"credit": ""'), '\n\n[TBC] Two lines on Tye''s coaching background and what families can expect on a Saturday.', ''), ', ["Entrance", "[TBC]"]', ''), ', {"a": "The refund and cancellation policy is [TBC].", "q": "What is the refund policy?", "note": ""}', ''), ' Selection details [TBC].', '')::jsonb,
  blocks_published = case when blocks_published is null then null else replace(replace(replace(replace(replace(blocks_published::text, '"credit": "[TBC]"', '"credit": ""'), '\n\n[TBC] Two lines on Tye''s coaching background and what families can expect on a Saturday.', ''), ', ["Entrance", "[TBC]"]', ''), ', {"a": "The refund and cancellation policy is [TBC].", "q": "What is the refund policy?", "note": ""}', ''), ' Selection details [TBC].', '')::jsonb end,
  updated_at = now()
 where brand_key = 'all-can' and (blocks_published::text like '%[TBC]%' or blocks_draft::text like '%[TBC]%')
   and slug in ('', 'toronto-midtown/basketball', 'basketball/youth-league', 'basketball');

update public.site_pages set
  blocks_draft = (select coalesce(jsonb_agg(b order by o), '[]'::jsonb) from jsonb_array_elements(blocks_draft) with ordinality t(b, o) where b->>'id' <> 'b-age'),
  blocks_published = case when blocks_published is null then null else (select coalesce(jsonb_agg(b order by o), '[]'::jsonb) from jsonb_array_elements(blocks_published) with ordinality t(b, o) where b->>'id' <> 'b-age') end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'basketball';

update public.site_pages set blocks_published = null, published_at = null, hidden_from_menu = true,
  seo = seo || '{"noindex": true}'::jsonb, updated_at = now()
 where brand_key = 'all-can' and slug in ('training', 'parent-guide');

update public.brand_sites set
  status = 'live',
  launched_at = coalesce(launched_at, now()),
  settings = settings - 'gate_password'
 where brand_key = 'all-can';

update public.brands set site_url = 'https://allcansport.ca' where key = 'all-can';
