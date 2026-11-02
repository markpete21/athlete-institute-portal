-- Program logo (owner, Nov 2 2026): a program can carry its own logo, shown in
-- place of its name in the location page header ("[logo] at De La Salle
-- College."). Additive; run BEFORE deploying the code that selects it.
alter table public.site_programs add column if not exists logo_url text;
comment on column public.site_programs.logo_url is 'Program logo (PNG, transparent). Shown in place of the program name in location page heads.';
