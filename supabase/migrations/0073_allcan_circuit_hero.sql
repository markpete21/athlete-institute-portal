-- Circuit page hero photo (owner, Oct 30 2026): registers the shipped file in Media.
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select 'all-can','photo','circuit-hero.jpg','Photos','/sites/all-can/photos/circuit-hero.jpg','Three ALL CAN Circuit players mid-game: a layup, a drive down the lane and a guard surveying the court.',false,'[TBC]',1376,768
 where not exists (select 1 from public.site_media where brand_key = 'all-can' and name = 'circuit-hero.jpg');
