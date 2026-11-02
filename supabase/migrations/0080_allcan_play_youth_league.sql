-- Play › Basketball (owner, Nov 2 2026): "League" reads "Youth League" and
-- goes to the Youth League program page (/basketball/youth-league, the
-- page row from 0078). Idempotent.
update public.site_nav_items n set label = 'Youth League', description = 'Skills block, then games.',
  href = '/basketball/youth-league', page_id = (select id from public.site_pages where brand_key = 'all-can' and slug = 'basketball/youth-league')
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.meta->>'sport' = 'basketball'
   and n.label in ('League', 'Youth League');
