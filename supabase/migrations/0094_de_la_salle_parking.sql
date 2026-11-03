-- Venue arrival details (owner, Nov 2 2026). De La Salle College (Toronto
-- Midtown) only: free parking on site, with a Campus map link that opens the
-- annotated aerial map in a dialog ("[label](image url)" in a fact renders as
-- that link). Athlete Institute (Orangeville): free parking on site; enter
-- through the main Fieldhouse entrance. Idempotent.
update public.site_locations set
  parking = 'Free parking on site · [Campus map](/sites/all-can/maps/de-la-salle-campus-map.jpg)',
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown';

update public.site_pages set
  blocks_draft = replace(blocks_draft::text, '["Parking", "[TBC]"]', '["Parking", "Free parking on site · [Campus map](/sites/all-can/maps/de-la-salle-campus-map.jpg)"]')::jsonb,
  blocks_published = case when blocks_published is null then null else replace(blocks_published::text, '["Parking", "[TBC]"]', '["Parking", "Free parking on site · [Campus map](/sites/all-can/maps/de-la-salle-campus-map.jpg)"]')::jsonb end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown/basketball';

update public.site_locations set
  parking = 'Free parking on site',
  arrival = 'Enter through the main Fieldhouse entrance.',
  updated_at = now()
 where brand_key = 'all-can' and slug = 'orangeville';
