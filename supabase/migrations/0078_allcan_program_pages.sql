-- Program landing pages (owner, Oct 30 2026): browse by program from Play
-- (/basketball/youth-league), by location from Locations. The page row gives
-- the landing page SEO fields and editable blocks; the content itself comes
-- from the program records.
insert into public.site_pages (brand_key, kind, template, ref, slug, title, blocks_draft, blocks_published, published_at, hidden_from_menu, sort_order, seo)
select 'all-can', 'system', 'program-line', 'basketball/youth-league', 'basketball/youth-league', 'ALL CAN Basketball Youth League', '[]'::jsonb, '[]'::jsonb, now(), false, 12,
  '{"title":"ALL CAN Basketball Youth League · Toronto","description":"The ALL CAN Basketball Youth League: a skills block, then gameplay, every week of the season. See where it runs and get notified when registration opens."}'::jsonb
where not exists (select 1 from public.site_pages where brand_key = 'all-can' and slug = 'basketball/youth-league');

-- League description (shown on the program page and the Basketball page)
update public.site_programs set description = coalesce(nullif(description, ''), 'Youth league. A skills block, then gameplay, every week of the season. Teams formed by age group, professional coaching and a full schedule.')
 where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league';

-- Play › Basketball › League goes to the program page
update public.site_nav_items n set href = '/basketball/youth-league', page_id = (select id from public.site_pages where brand_key = 'all-can' and slug = 'basketball/youth-league')
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.meta->>'sport' = 'basketball' and n.label = 'League';
