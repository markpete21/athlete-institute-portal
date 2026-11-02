-- Hotfix (Nov 2 2026): the register_url column from 0071_toronto_midtown_
-- league_landing without the rest of that migration. The code reading it
-- shipped before the column reached prod, so every program query failed
-- (empty program pages, Basketball program list and Circuit key info).
-- Additive and idempotent; the Toronto content in 0071 is a separate call.
alter table public.site_programs add column if not exists register_url text;
comment on column public.site_programs.register_url is 'External registration page (e.g. Playbook). Register button while status = open and no Play program is linked.';
