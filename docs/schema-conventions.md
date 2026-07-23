# Schema Conventions — Athlete Institute Portal

The rules every migration and table from Module 1 onward follows. The DB is the
portal's own Supabase project (`rrgjqsprafblrmjsaikh`); auth is **Clerk**, not
Supabase Auth — that drives most of the access-model choices below.

## Access model

- **All app reads/writes go through the service-role client** (`supabaseAdmin()`
  from `@ai/foundation/supabase`) in server code, after Clerk session + role
  checks have already been applied in the app layer.
- **RLS is ENABLED on every table, with NO anon policies.** The public anon key
  is deliberately inert — an attacker holding it can read/write nothing. Do not
  add permissive policies "to make something work"; fix the server path instead.
- If a future feature genuinely needs client-side Supabase reads, write a
  narrowly-scoped policy in a migration with a comment explaining why.

## Naming

- `snake_case` for tables and columns; singular-noun prefixes for module
  families when helpful (Module 1 owns `profiles`, `families`, …).
- Primary keys: `id bigint generated always as identity` (or `uuid` when the id
  leaks into URLs — e.g. claim tokens).
- Foreign keys always declared (`references … on delete …` — pick the delete
  behavior deliberately; default to `restrict`).
- Clerk identity: store `clerk_user_id text` (mirrored into `profiles`; other
  tables FK to `profiles`, not to Clerk ids).

## Timestamps

- Every table: `created_at timestamptz not null default now()` and (if rows
  mutate) `updated_at timestamptz not null default now()` maintained by the
  shared `set_updated_at()` trigger (created in migration 0001).
- Business timestamps (season boundaries, business-day math) use
  **America/Toronto** via `@ai/foundation` date utilities — the DB stores UTC.

## Migrations

- Numbered SQL files in `supabase/migrations/` (`0001_foundation.sql`, …),
  **idempotent** (`create … if not exists`, `on conflict do nothing`), pasted
  into the Supabase SQL Editor to apply (same workflow as the live repo).
- A migration that alters shared foundations (audit_log, brands) documents the
  consuming code path in a comment.

## Audit

- Sensitive actions (refunds, overrides, permission changes, deletions, credit
  adjustments) call `audit()` from `@ai/foundation` — never insert into
  `audit_log` directly. The table is **append-only by convention**: no update or
  delete statements from app code, ever.

## Money

- Integer **cents** columns (`amount_cents bigint`), currency implied CAD unless
  a `currency` column exists. All arithmetic through `@ai/foundation` money
  utilities; never floats, never math in SQL that rounds.

## Storage

- Five private buckets (see `@ai/foundation/storage`): `staff-photos`,
  `event-logos`, `display-media`, `product-images`, `documents`.
- Object paths: `<entity>/<id>/<filename>` (e.g. `staff/123/headshot.jpg`).
- Access ONLY via time-limited signed URLs minted server-side after
  authorization. No public buckets.
