-- Division labels (owner, Nov 2 2026): basketball, soccer and flag football
-- write age divisions as U13 / U17; volleyball writes them as 13U / 17U.
-- Today only basketball has divisions on the site: the Toronto Midtown Youth
-- League (13U/17U -> U13/U17). The Circuit already reads U13/U14/U15 Boys.
-- Idempotent (only rewrites the 13U form, and only on non-volleyball rows).

update public.site_programs set
  facts = regexp_replace(facts::text, '\m(\d{1,2})U\M', 'U\1', 'g')::jsonb,
  description = case when description is null then null else regexp_replace(description, '\m(\d{1,2})U\M', 'U\1', 'g') end,
  updated_at = now()
 where brand_key = 'all-can' and sport in ('basketball', 'soccer', 'flag-football')
   and (facts::text ~ '\m\d{1,2}U\M' or description ~ '\m\d{1,2}U\M');

update public.site_pages set
  blocks_draft = regexp_replace(blocks_draft::text, '\m(\d{1,2})U\M', 'U\1', 'g')::jsonb,
  blocks_published = case when blocks_published is null then null else regexp_replace(blocks_published::text, '\m(\d{1,2})U\M', 'U\1', 'g')::jsonb end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown/basketball';
