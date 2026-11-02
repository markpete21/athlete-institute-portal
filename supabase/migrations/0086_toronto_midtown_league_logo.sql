-- Toronto Midtown (owner, Nov 2 2026): the ALL CAN Basketball League logo on
-- the Youth League program, so the /toronto-midtown header reads
-- "[logo] at De La Salle College." Run once the logo file is in the repo.
update public.site_programs set logo_url = '/sites/all-can/logos/allcan-basketball-league-red.png', updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league';
