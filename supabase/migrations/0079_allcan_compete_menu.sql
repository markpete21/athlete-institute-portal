-- ALL CAN menus (owner, Nov 2 2026). Compete: ALL CAN Circuit is the column's
-- title (still a link) with the other links indented beneath it; Rosters
-- hidden for now. Idempotent.
update public.site_nav_items n set meta = n.meta || '{"heading":true}'::jsonb
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Compete' and f.parent_id is null
   and n.label = 'ALL CAN Circuit' and not n.featured;
update public.site_nav_items n set visible = false
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Compete' and f.parent_id is null
   and n.label = 'Rosters';
update public.site_nav_items set description = 'Schedules, results and standings.'
 where brand_key = 'all-can' and label = 'Compete' and parent_id is null;

-- Compete links jump to the sections on the Circuit page
update public.site_nav_items n set href = '/circuit#schedule', page_id = null
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Compete' and f.parent_id is null
   and n.label = 'Schedules & Results';
update public.site_nav_items n set href = '/circuit#standings', page_id = null
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Compete' and f.parent_id is null
   and n.label = 'Standings';

-- Play featured card: no "Youth League" line over the photo
update public.site_nav_items n set meta = n.meta - 'note'
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Play' and f.parent_id is null and n.featured;
