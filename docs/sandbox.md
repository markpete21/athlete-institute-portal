# Sandbox environments

One sandbox per production database, shared by the apps that live on it.
Written 2026-08-08.

## Topology

| Sandbox project | Project ref | Mirrors prod DB | Apps served | Repo(s) |
| --- | --- | --- | --- | --- |
| **sandbox-portal** | `wxcaucyeaabtejpgvugl` | `rrgjqsprafblrmjsaikh` | admin, play, compete | `athlete-institute-portal` |
| **sandbox-live** | `upskqpifjluzlkxpjfvh` | `vrlbpndqtuxwgujudifk` | home (hub), live, tickets, goals | `athlete-institute-live` + `athlete-institute-dashboard` |

Both bootstrapped and fully migrated 2026-08-18. sandbox-portal lives in the
free `athlete-institute-portal` org (free tier pauses after ~1 week idle —
restore with one click in the dashboard); sandbox-live is in the Pro org.

Two sandboxes are required — the portal schema and the live schema both define
`profiles` and `seasons`, so they cannot share one database.

**Already sandboxed, no new copies needed:** Clerk (all apps run on the
development instance, `pk_test_…`) and Stripe (test mode, `sk_test_…`). When
the apps go public, *production* gets new Clerk production-instance keys and
Stripe live keys — the sandbox keeps the current test keys.

## Files

- `.env.sandbox` in each repo (gitignored) — same keys as `.env.local` except
  the three `*SUPABASE*` values, which point at the sandbox project.
- `scripts/migrate-all.mjs` in each repo — applies every pending migration in
  `supabase/migrations/` (sorted order) via the `exec_sql` RPC, and records
  progress in a `_migrations` table so re-runs only apply new files.

## One-time bootstrap (per new Supabase project)

1. In the new project's **SQL Editor**, paste and run
   `supabase/migrations/0000_exec_sql.sql` (exec_sql can't install itself).
2. Fill the three Supabase values in `.env.sandbox`
   (Project Settings → API: URL, `anon` key, `service_role` key).
3. Apply the schema:

   ```bash
   # portal repo → sandbox-portal
   node scripts/migrate-all.mjs --env .env.sandbox

   # live repo → sandbox-live (run FIRST — dashboard tables depend on it)
   node scripts/migrate-all.mjs --env .env.sandbox

   # dashboard repo → sandbox-live (same project as live's .env.sandbox)
   node scripts/migrate-all.mjs --env .env.sandbox
   ```

4. Optional, once per **prod** DB: `node scripts/migrate-all.mjs --mark-applied`
   records the existing migrations in `_migrations` without running anything,
   so the same tool can be used for prod pushes going forward.

## Day-to-day workflow

- **Local dev runs against the sandbox.** Swap the Supabase block of
  `.env.local` to the sandbox values (or copy `.env.sandbox` over it) so a bad
  migration or a testing spree can never touch real data.
- **New schema change** → new numbered file in `supabase/migrations/` → apply
  to sandbox first (`migrate-all --env .env.sandbox`), verify the app, then
  apply to prod (`migrate-all` with the prod env) when the code ships.
- **Vercel**: keep sandbox Supabase keys in the *Preview* environment scope and
  prod keys in *Production*. Preview deployments (every non-main branch) then
  exercise the sandbox DB automatically.
- **Seeding**: portal has `scripts/seed-demo-*.mjs` for demo data. Run them
  with the sandbox env active. Never copy real customer rows into a sandbox.

## Go-public checklist (later, separate task)

- Create Clerk **production instances** + Stripe **live mode** keys → Vercel
  Production env only.
- Second Stripe webhook endpoint per app pointing at the production URL.
- Non-production send guard for Resend/Twilio/web-push (deliver only to
  allowlisted addresses when `VERCEL_ENV !== 'production'`).
