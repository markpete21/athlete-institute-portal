-- ============================================================================
-- Migration 0049 - organizations become bookable customers in their own right.
--
-- Before: organizations required a Clerk workspace (clerk_org_id NOT NULL),
-- so a rental customer like a visiting club could not exist as an org unless
-- someone provisioned Clerk. Now clerk_org_id is nullable (a Clerk workspace
-- is something an org MAY have, not what defines it), and each org carries a
-- REPRESENTATIVE: name/email/phone used for quotes and invoicing. The rep
-- does not need an account; rep_profile_id optionally links one if they have
-- or later claim it.
-- Idempotent - safe to re-run.
-- ============================================================================

alter table public.organizations alter column clerk_org_id drop not null;

alter table public.organizations add column if not exists rep_name  text;
alter table public.organizations add column if not exists rep_email text;
alter table public.organizations add column if not exists rep_phone text;
alter table public.organizations
  add column if not exists rep_profile_id bigint references public.profiles (id) on delete set null;
alter table public.organizations add column if not exists created_by text;

comment on column public.organizations.rep_name is
  'Representative for quotes/invoicing. No account required; rep_profile_id links one if they have it.';
