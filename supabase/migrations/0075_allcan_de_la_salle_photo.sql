-- Toronto Midtown venue photo (owner, Oct 30 2026): the De La Salle College gym.
-- Used on the Locations menu card, the Toronto Midtown hub and its basketball page.
update public.site_locations set photo_url = '/sites/all-can/photos/de-la-salle-gym.jpg',
  photo_alt = 'The gym at De La Salle College, Toronto: a bright hardwood court with glass walls along one side.'
 where brand_key = 'all-can' and slug = 'toronto-midtown';
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select 'all-can','photo','de-la-salle-gym.jpg','Photos','/sites/all-can/photos/de-la-salle-gym.jpg','The gym at De La Salle College, Toronto: a bright hardwood court with glass walls along one side.',false,'[TBC]',2000,1125
 where not exists (select 1 from public.site_media where brand_key = 'all-can' and name = 'de-la-salle-gym.jpg');
