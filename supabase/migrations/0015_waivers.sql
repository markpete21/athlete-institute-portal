-- ============================================================================
-- Migration 0015 - Module 3 Stage 5: waiver editor + e-signatures
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- Waivers are named, versioned templates staff compose. When attached to a
-- rental (optionally defaulted by booking type), the renter/organizer signs
-- ONCE electronically; the signed record gates confirming the booking. This
-- editor + signature model is REUSED by Module 4 (programs).
-- ============================================================================

create table if not exists public.waivers (
  id          bigint generated always as identity primary key,
  name        text not null,
  body        text not null,                 -- waiver text (markdown/plain)
  version     integer not null default 1,
  active      boolean not null default true,
  -- Optional default attachment by rental booking type (camp/event/...).
  default_for_booking_type text,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists waivers_updated_at on public.waivers;
create trigger waivers_updated_at
  before update on public.waivers
  for each row execute function public.set_updated_at();

alter table public.waivers enable row level security;

-- A signed waiver instance, captured against a rental (and later, programs).
-- entity_type/entity_id keep it reusable beyond rentals (Module 4).
create table if not exists public.waiver_signatures (
  id            bigint generated always as identity primary key,
  waiver_id     bigint not null references public.waivers (id) on delete restrict,
  waiver_version integer not null,
  entity_type   text not null default 'rental' check (entity_type in ('rental','program')),
  entity_id     bigint not null,
  signer_name   text not null,
  signer_email  text,
  signer_profile_id bigint references public.profiles (id) on delete set null,
  -- The e-signature: typed full name + captured metadata (PIPEDA: minimal).
  signature_text text not null,
  signed_at     timestamptz not null default now(),
  ip_hint       text,
  created_at    timestamptz not null default now()
);

alter table public.waiver_signatures enable row level security;

create index if not exists waiver_signatures_entity_idx
  on public.waiver_signatures (entity_type, entity_id);

-- Attach a chosen waiver to a rental (the one the renter must sign).
alter table public.rentals add column if not exists waiver_id bigint references public.waivers (id) on delete set null;
