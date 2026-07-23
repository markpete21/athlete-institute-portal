-- ============================================================================
-- Migration 0017 - Module 4 Stage 2: custom question builder
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- A reusable question LIBRARY, attachable per program (defaults seeded per
-- type). Answers store per registrant. Plus the ONE standardized global
-- "where did you hear about us" question with a managed answer list, asked
-- once per registration/checkout (not per participant).
-- ============================================================================

create table if not exists public.questions (
  id          bigint generated always as identity primary key,
  label       text not null,
  help_text   text,
  qtype       text not null default 'short_text'
                check (qtype in ('short_text','long_text','single_choice','multi_choice','number','date','file','size')),
  options     jsonb not null default '[]'::jsonb,   -- for choice/size types
  required    boolean not null default false,
  -- Library entry can be a per-type default template (program_type_id set) or
  -- a free-standing saved question (null) - attached to programs via program_questions.
  default_for_type_id bigint references public.program_types (id) on delete set null,
  archived    boolean not null default false,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists questions_updated_at on public.questions;
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();
alter table public.questions enable row level security;

-- A question attached to a specific program (ordered, override required flag).
create table if not exists public.program_questions (
  id          bigint generated always as identity primary key,
  program_id  bigint not null references public.programs (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete cascade,
  sort_order  integer not null default 0,
  required    boolean,                              -- null = inherit question.required
  created_at  timestamptz not null default now(),
  unique (program_id, question_id)
);
alter table public.program_questions enable row level security;
create index if not exists program_questions_program_idx on public.program_questions (program_id, sort_order);

-- Answers, stored per registrant.
create table if not exists public.question_answers (
  id              bigint generated always as identity primary key,
  registration_id bigint not null references public.registrations (id) on delete cascade,
  question_id     bigint not null references public.questions (id) on delete cascade,
  answer          jsonb not null,                    -- string | string[] | number | file ref
  created_at      timestamptz not null default now(),
  unique (registration_id, question_id)
);
alter table public.question_answers enable row level security;
create index if not exists question_answers_reg_idx on public.question_answers (registration_id);

-- The standardized global "where did you hear about us" answer list lives in
-- portal_settings; seed a default managed list (admin-editable).
insert into public.portal_settings (key, value) values
  ('marketing_source_options',
   '["Instagram","Google","Word of Mouth","School","Coach Referral","Returning Athlete","Other"]'::jsonb)
on conflict (key) do nothing;

-- Marketing source captured once per registration (not per participant).
-- Stored on registrations so it applies to all participants in that checkout.
alter table public.registrations add column if not exists marketing_source text;
