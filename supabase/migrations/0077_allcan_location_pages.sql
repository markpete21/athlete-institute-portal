-- Location pages (owner, Oct 30 2026): program leadership per location, and
-- the Toronto Midtown content changes.
alter table public.site_locations add column if not exists leaders jsonb not null default '[]';

-- Toronto Midtown: no area-name note; new key-date labels
update public.site_locations set
  note = null,
  calendar = '[["Registration opens","[TBC]"],["Registration deadline","[TBC]"],["First session and evaluations","[TBC]"],["Team formation and uniforms","[TBC]"],["Last session & championships","[TBC]"]]'::jsonb
 where brand_key = 'all-can' and slug = 'toronto-midtown';

-- Toronto Midtown: just the Youth League for now (skills off the page)
update public.site_programs set status = 'archived' where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-skills';
update public.site_programs set name = 'ALL CAN Basketball Youth League' where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league';

-- Lockup in Media
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select 'all-can','logo','lockup-all-canadian.png','Brand','/sites/all-can/logos/lockup-all-canadian.png','All Canadian Games and ALL CAN',false,'ALL CAN brand system',910,420
 where not exists (select 1 from public.site_media where brand_key = 'all-can' and name = 'lockup-all-canadian.png');
