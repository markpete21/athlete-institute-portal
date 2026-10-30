-- Top scorers and player of the game per finished game (owner, Oct 30 2026).
-- Shape: {"home":[{"name":"…","pts":23}],"away":[…],"potg":"…"}
alter table public.site_league_games add column if not exists scorers jsonb;
