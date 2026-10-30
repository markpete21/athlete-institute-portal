-- Orangeville venue photo (owner, Oct 30 2026): the Athlete Institute gym.
-- Used on the Locations menu card, the Orangeville hub and its basketball page.
update public.site_locations set photo_url = '/sites/all-can/photos/athlete-institute-gym.jpg',
  photo_alt = 'The Athlete Institute gym in Orangeville: the main court with the Orangeville script wall and retired-number banners.'
 where brand_key = 'all-can' and slug = 'orangeville';
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select 'all-can','photo','athlete-institute-gym.jpg','Photos','/sites/all-can/photos/athlete-institute-gym.jpg','The Athlete Institute gym in Orangeville: the main court with the Orangeville script wall and retired-number banners.',false,'[TBC]',2000,1333
 where not exists (select 1 from public.site_media where brand_key = 'all-can' and name = 'athlete-institute-gym.jpg');
