-- Play menu featured card (owner, Oct 30 2026): De La Salle gym photo,
-- "Youth League / ALL CAN Basketball / Toronto Winter 2027".
update public.site_nav_items n set label = 'ALL CAN Basketball', description = 'Toronto Winter 2027', href = '/toronto-midtown/basketball',
  image_url = '/sites/all-can/photos/menu-toronto-basketball.jpg', meta = n.meta || '{"note":"Youth League"}'::jsonb
  from public.site_nav_items f
 where n.brand_key = 'all-can' and f.brand_key = 'all-can' and n.parent_id = f.id and f.label = 'Play' and f.parent_id is null and n.featured;
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select 'all-can','photo','menu-toronto-basketball.jpg','Photos','/sites/all-can/photos/menu-toronto-basketball.jpg','The De La Salle College gym in Toronto, empty court with the ALL CAN crest.',false,'[TBC]',1400,788
 where not exists (select 1 from public.site_media where brand_key = 'all-can' and name = 'menu-toronto-basketball.jpg');
