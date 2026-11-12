-- 0108: where a game's highlight reels are sold (the Live app sets this when
-- reels go on sale). Idempotent.
alter table public.site_league_games add column if not exists reels_url text;
