-- ============================================================================
-- Module 15: Feedback & Ratings. run-migration.mjs. Idempotent.
-- ============================================================================

-- Per-program rating display toggle (private by default).
alter table public.programs add column if not exists rating_public boolean not null default false;

-- Feedback form templates (per program type, editable, brand-themed).
create table if not exists public.feedback_forms (
  id           bigint generated always as identity primary key,
  name         text not null,
  program_type_key text,          -- seeded default per type; null = custom
  questions    jsonb not null default '[]'::jsonb,  -- [{key,label,type,options?}]
  brand_key    text,
  created_by   text,
  created_at   timestamptz not null default now()
);
alter table public.feedback_forms enable row level security;

-- Feedback rounds: when a program prompts (end / mid / post), with reminder state.
create table if not exists public.feedback_rounds (
  id           bigint generated always as identity primary key,
  program_id   bigint not null references public.programs (id) on delete cascade,
  round        text not null default 'end' check (round in ('end','mid','post')),
  form_id      bigint references public.feedback_forms (id) on delete set null,
  prompt_at    timestamptz not null,
  prompted_at  timestamptz,
  reminded_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (program_id, round)
);
alter table public.feedback_rounds enable row level security;
create index if not exists feedback_rounds_due_idx on public.feedback_rounds (prompt_at) where prompted_at is null;

-- Responses: one per participant registration per round. token = deep link.
create table if not exists public.feedback_responses (
  id               bigint generated always as identity primary key,
  round_id         bigint not null references public.feedback_rounds (id) on delete cascade,
  program_id       bigint not null references public.programs (id) on delete cascade,
  registration_id  bigint not null references public.registrations (id) on delete cascade,
  family_id        bigint references public.families (id) on delete set null,
  token            text not null unique,
  rating           integer check (rating between 1 and 5),  -- rating-of-record
  comment          text,
  answers          jsonb,                                    -- full-form answers
  kind             text check (kind in ('quick','full')),
  submitted_at     timestamptz,
  points_credited  integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (round_id, registration_id)
);
alter table public.feedback_responses enable row level security;
create index if not exists feedback_responses_program_idx on public.feedback_responses (program_id);

-- AI summaries per program per round.
create table if not exists public.feedback_summaries (
  id          bigint generated always as identity primary key,
  program_id  bigint not null references public.programs (id) on delete cascade,
  round_id    bigint references public.feedback_rounds (id) on delete set null,
  summary     text not null,
  model       text,
  created_at  timestamptz not null default now()
);
alter table public.feedback_summaries enable row level security;

-- Seeded per-type default forms.
insert into public.feedback_forms (name, program_type_key, questions)
select v.name, v.key, v.questions::jsonb
from (values
  ('Camp feedback', 'camp', '[{"key":"overall","label":"Overall, how would you rate this program?","type":"stars"},{"key":"coaches","label":"How were the coaches?","type":"scale5"},{"key":"facilities","label":"How were the facilities?","type":"scale5"},{"key":"value","label":"Was it good value?","type":"yesno"},{"key":"comment","label":"Anything else?","type":"text"}]'),
  ('League feedback', 'league', '[{"key":"overall","label":"Overall, how would you rate this program?","type":"stars"},{"key":"scheduling","label":"How was the scheduling?","type":"scale5"},{"key":"officiating","label":"How was the officiating?","type":"scale5"},{"key":"competitiveness","label":"Were games competitive?","type":"scale5"},{"key":"comment","label":"Anything else?","type":"text"}]'),
  ('Quick review', null, '[{"key":"overall","label":"Overall, how would you rate this program?","type":"stars"},{"key":"comment","label":"Optional comment","type":"text"}]')
) as v(name, key, questions)
where not exists (select 1 from public.feedback_forms f where f.name = v.name);

-- Auto-notification triggers for feedback prompts + low-score alert.
insert into public.comms_auto_notifications (trigger_key, label, channels, subject, body_template) values
  ('feedback.prompt',   'Feedback prompt',            '{email,push}', 'How was {{program_name}}?', 'Rate {{program_name}} in one tap - 50 Play Points for a quick review, 250 for the full form: {{form_url}}'),
  ('feedback.reminder', 'Feedback reminder',          '{email}',      'Quick reminder - {{program_name}}', 'One tap to rate {{program_name}} and earn Play Points: {{form_url}}'),
  ('feedback.low_score','Low feedback score (staff)', '{email,push}', 'LOW SCORE: {{program_name}}', '{{respondent}} rated {{program_name}} {{rating}}/5: "{{comment}}" - follow up while they are reachable.')
on conflict (trigger_key) do nothing;
