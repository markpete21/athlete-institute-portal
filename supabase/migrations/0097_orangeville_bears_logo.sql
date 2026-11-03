-- Orangeville Bears logo on the Circuit (owner, Nov 3 2026): the red bear head,
-- background cleared, 512px square. Run after the file deploys. Idempotent.
update public.site_league_teams set logo_url = '/sites/all-can/teams/orangeville-bears.png'
 where brand_key = 'all-can' and league_slug = 'circuit' and name = 'Orangeville Bears';
