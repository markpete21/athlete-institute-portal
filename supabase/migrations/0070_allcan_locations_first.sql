-- ALL CAN menu: Locations first, then Play (owner decision, Oct 30 2026).
update public.site_nav_items set sort_order = 1 where brand_key = 'all-can' and parent_id is null and label = 'Locations';
update public.site_nav_items set sort_order = 2 where brand_key = 'all-can' and parent_id is null and label = 'Play';
