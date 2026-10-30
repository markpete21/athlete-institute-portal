-- Athlete Institute venue photos (owner, Oct 30 2026): the Fieldhouse (main
-- gym with the Orangeville script wall) is the Orangeville location photo;
-- the Dome (Circuit home court) is a second venue photo. Locations gain a
-- `photos` list for extra venue shots.
alter table public.site_locations add column if not exists photos jsonb not null default '[]';
update public.site_locations set
  photo_url = '/sites/all-can/photos/athlete-institute-fieldhouse.jpg',
  photo_alt = 'The Athlete Institute Fieldhouse in Orangeville: the main court with the Orangeville script wall and retired-number banners.',
  photos = '[{"url":"/sites/all-can/photos/athlete-institute-fieldhouse.jpg","alt":"The Athlete Institute Fieldhouse: main court with the Orangeville script wall.","caption":"Fieldhouse"},{"url":"/sites/all-can/photos/athlete-institute-dome.jpg","alt":"The Athlete Institute Dome: courts under the white dome with bleachers along the netting.","caption":"Dome"}]'::jsonb
 where brand_key = 'all-can' and slug = 'orangeville';
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select * from (values
  ('all-can','photo','athlete-institute-fieldhouse.jpg','Photos','/sites/all-can/photos/athlete-institute-fieldhouse.jpg','The Athlete Institute Fieldhouse in Orangeville: the main court with the Orangeville script wall and retired-number banners.',false,'[TBC]',2000,1333),
  ('all-can','photo','athlete-institute-dome.jpg','Photos','/sites/all-can/photos/athlete-institute-dome.jpg','The Athlete Institute Dome: courts under the white dome with bleachers along the netting.',false,'[TBC]',2000,1500)
) as v(brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
where not exists (select 1 from public.site_media m where m.brand_key = v.brand_key and m.name = v.name);
