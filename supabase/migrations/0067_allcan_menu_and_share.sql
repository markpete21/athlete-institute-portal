-- ALL CAN site: menu and brand tweaks from the owner's first walk-through
-- (Oct 30, 2026). Idempotent: safe to run more than once.
--
--  Play › Basketball lists League and Rep Circuit only; the "All basketball"
--  link is gone (code). Volleyball / Soccer / Flag Football tabs read
--  "Coming Spring 2027." and keep the request link. Featured card: Toronto
--  Midtown, De La Salle · ALL CAN Youth Basketball League.
--  Compete: ALL CAN Circuit above the list; the featured card is the Circuit
--  lockup on white.
--  Share image: the crest on black. Favicon: the red maple leaf.

-- Play › Basketball: League + Rep Circuit
delete from public.site_nav_items n using public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id
   and f.meta->>'sport' = 'basketball' and n.label = 'Skills';
update public.site_nav_items n set label = 'Rep Circuit', description = 'League in Orangeville, ON', href = '/circuit'
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id
   and f.meta->>'sport' = 'basketball' and n.label in ('Circuit', 'Rep Circuit');
update public.site_nav_items n set description = coalesce(n.description, 'Youth league. Skills block, then games.')
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id
   and f.meta->>'sport' = 'basketball' and n.label = 'League';

-- Coming-soon sports: one line
update public.site_nav_items set meta = meta || '{"note":"Coming Spring 2027."}'::jsonb
 where brand_key = 'all-can' and kind = 'folder' and (meta->>'soon')::boolean is true;

-- Play featured card
update public.site_nav_items n set label = 'Toronto Midtown, De La Salle', description = 'ALL CAN Youth Basketball League', href = '/toronto-midtown/basketball', image_url = null
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Play' and f.parent_id is null and n.featured;

-- Compete: ALL CAN Circuit first, Circuit lockup as the featured card
insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order)
select 'all-can', f.id, 'page', 'ALL CAN Circuit', '/circuit', 0
  from public.site_nav_items f
 where f.brand_key = 'all-can' and f.label = 'Compete' and f.parent_id is null
   and not exists (select 1 from public.site_nav_items x where x.brand_key = 'all-can' and x.parent_id = f.id and x.label = 'ALL CAN Circuit' and not x.featured);
update public.site_nav_items n set label = 'ALL CAN Circuit', href = '/circuit', image_url = '/sites/all-can/logos/circuit-on-white.png', description = 'Rep Basketball League · Orangeville', meta = n.meta || '{"card":"logo"}'::jsonb
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Compete' and f.parent_id is null and n.featured;

-- Media rows for the new files
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select 'all-can','logo','circuit-on-white.png','Brand','/sites/all-can/logos/circuit-on-white.png','ALL CAN Circuit',false,'ALL CAN brand system',1400,489
 where not exists (select 1 from public.site_media where brand_key = 'all-can' and name = 'circuit-on-white.png');
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select 'all-can','logo','share.png','Brand','/sites/all-can/share.png','ALL CAN crest on black',false,'ALL CAN brand system',1200,630
 where not exists (select 1 from public.site_media where brand_key = 'all-can' and name = 'share.png');

-- Share image + favicon
update public.brand_sites set seo = seo || '{"og_image_url":"/sites/all-can/share.png","favicon_url":"/sites/all-can/favicon.png"}'::jsonb where brand_key = 'all-can';

-- Circuit program record: the label the Circuit page and menus show
update public.site_programs set league_type = 'Rep' where brand_key = 'all-can' and slug = 'circuit';
