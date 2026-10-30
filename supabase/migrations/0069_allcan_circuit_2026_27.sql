-- ALL CAN Circuit 2026-27 on the website (schedules from the four monthly
-- PDFs, Oct 30 2026). Teams: Orangeville Bears, Woodbridge Lions, Motion
-- Kings, Nexus Wolves, David Ann Academy. Wednesdays 6:30pm and 8:00pm ET at
-- the Athlete Institute Dome, Orangeville, hosted by Orangeville Bears.
-- Idempotent.

-- Team applications are a lead kind
alter table public.site_leads drop constraint if exists site_leads_kind_check;
alter table public.site_leads add constraint site_leads_kind_check check (kind in ('interest','request','host','contact','assistance','apply'));

-- Program facts (the key-info block on the Circuit page)
update public.site_programs set
  name = 'ALL CAN Circuit',
  status = 'open',
  status_label = '2026-27 season under way',
  description = 'Rep basketball league. Four Wednesday nights a month, two games a night, three divisions. Hosted by Orangeville Bears at the Athlete Institute Dome.',
  facts = '[["Season","November 4, 2026 to February 24, 2027, then Championship Weekend February 27 and 28"],["Divisions","U13 Boys · U14 Boys · U15 Boys"],["Games","Wednesdays, 6:30pm and 8:00pm ET"],["Home venue","Athlete Institute Dome · 207321 Highway 9, Mono, ON L9W 6J2"],["Hosted by","Orangeville Bears"],["Teams","Orangeville Bears · Woodbridge Lions · Motion Kings · Nexus Wolves · David Ann Academy"],["Holiday break","No games December 23 to 30. Back Wednesday, January 6."],["Championship Weekend","February 27 and 28, Main Gym. Times and format to be confirmed."],["2027-28","Applications open. Use Apply for 2027-28 on this page."]]'::jsonb
where brand_key = 'all-can' and slug = 'circuit';

-- Games (Toronto is UTC-5 from Nov 1, 2026; UTC-5 through Feb 2027)
insert into public.site_league_games (brand_key, league_slug, division, starts_at, venue, home, away, status, note, created_by)
select 'all-can', 'circuit', v.division, (v.d || ' ' || v.t || '-05:00')::timestamptz, 'Athlete Institute Dome', v.home, v.away, 'scheduled', v.note, 'system:migration'
from (values
  ('U13 Boys','2026-11-04','18:30','Orangeville Bears','Woodbridge Lions','League opener'),
  ('U13 Boys','2026-11-04','20:00','Woodbridge Lions','Motion Kings','League opener'),
  ('U14 Boys','2026-11-11','18:30','Orangeville Bears','Woodbridge Lions','Round 1'),
  ('U14 Boys','2026-11-11','20:00','Orangeville Bears','Nexus Wolves','Round 1'),
  ('U15 Boys','2026-11-18','18:30','Orangeville Bears','Nexus Wolves','Round 1'),
  ('U15 Boys','2026-11-18','20:00','Motion Kings','David Ann Academy','Round 1'),
  ('U13 Boys','2026-11-25','18:30','Orangeville Bears','Motion Kings','Round 2'),
  ('U14 Boys','2026-12-02','18:30','Woodbridge Lions','Nexus Wolves','Round 2'),
  ('U15 Boys','2026-12-09','18:30','Orangeville Bears','Motion Kings','Round 2'),
  ('U15 Boys','2026-12-09','20:00','David Ann Academy','Nexus Wolves','Round 2'),
  ('U13 Boys','2026-12-16','18:30','Motion Kings','Orangeville Bears','Round 3'),
  ('U13 Boys','2026-12-16','20:00','Motion Kings','Woodbridge Lions','Round 3'),
  ('U14 Boys','2027-01-06','18:30','Woodbridge Lions','Orangeville Bears','Round 3'),
  ('U14 Boys','2027-01-06','20:00','Woodbridge Lions','Nexus Wolves','Round 3'),
  ('U15 Boys','2027-01-13','18:30','Orangeville Bears','David Ann Academy','Round 3'),
  ('U15 Boys','2027-01-13','20:00','Nexus Wolves','Motion Kings','Round 3'),
  ('U13 Boys','2027-01-20','18:30','Woodbridge Lions','Orangeville Bears','Round 4'),
  ('U14 Boys','2027-01-27','18:30','Nexus Wolves','Orangeville Bears','Round 4'),
  ('U15 Boys','2027-02-03','18:30','Nexus Wolves','Orangeville Bears','Bonus round'),
  ('U15 Boys','2027-02-03','20:00','David Ann Academy','Motion Kings','Bonus round'),
  ('U13 Boys','2027-02-10','18:30','Orangeville Bears','Woodbridge Lions','Bonus round'),
  ('U13 Boys','2027-02-10','20:00','Motion Kings','Orangeville Bears','Bonus round'),
  ('U14 Boys','2027-02-17','18:30','Nexus Wolves','Orangeville Bears','Bonus round'),
  ('U14 Boys','2027-02-17','20:00','Nexus Wolves','Woodbridge Lions','Bonus round'),
  ('U15 Boys','2027-02-24','18:30','Motion Kings','Orangeville Bears','Final regular-season night'),
  ('U15 Boys','2027-02-24','20:00','Nexus Wolves','David Ann Academy','Final regular-season night')
) as v(division, d, t, home, away, note)
where not exists (
  select 1 from public.site_league_games g
   where g.brand_key = 'all-can' and g.league_slug = 'circuit' and g.home = v.home and g.away = v.away
     and g.starts_at = (v.d || ' ' || v.t || '-05:00')::timestamptz
);

-- Circuit page: no default interest block; the page template carries the sections
update public.site_pages set seo = seo || '{"title":"ALL CAN Circuit · Rep basketball league in Orangeville","description":"The ALL CAN Circuit rep basketball league: U13, U14 and U15 Boys, Wednesday nights at the Athlete Institute Dome in Orangeville. Schedule, results, standings and how to apply for 2027-28."}'::jsonb
where brand_key = 'all-can' and slug = 'circuit';

-- Home page: drop the Schedules/Standings big buttons for now (Locations stays)
update public.site_pages set
  blocks_draft = (select coalesce(jsonb_agg(b), '[]'::jsonb) from jsonb_array_elements(blocks_draft) b where b->>'type' <> 'big_buttons'),
  blocks_published = case when blocks_published is null then null else (select coalesce(jsonb_agg(b), '[]'::jsonb) from jsonb_array_elements(blocks_published) b where b->>'type' <> 'big_buttons') end
where brand_key = 'all-can' and slug = '';
