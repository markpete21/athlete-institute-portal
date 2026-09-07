# Architecture conventions

The rules every new screen, action and module follows. Each section names the
one file that owns the rule so a change is a single edit. Read this before
adding a program type, a booking source, a cron, a webhook, or an admin screen.

## Request lifecycle

- **Host → tree.** `middleware.ts` resolves the host to `play` / `admin` /
  `compete` and rewrites into `app/<tree>`. Compete is fully public; admin
  requires a session (role check lives in the admin layout).
- **Session.** `lib/auth.ts#getPortalSession` is memoised per request with
  React `cache()`. Layout, page and any server action share one Clerk lookup,
  one profile mirror, one roles read. `getOrCreateProfile` is memoised too.
- **Guards.** Never re-derive a permission in an action:
  - `requireStaff()` → `StaffSession` (non-null `userId`, `profileId`).
  - `requireStaffCapability(cap, mode)` → staff + Module 5 matrix (bootstrap
    allowlist passes everything).
  - `requireSignedIn()`, `requireCustomer()` (may transact: not tenant, not
    suspended), `requireFamily()` (has a household; suspended may still pay).
  - `hasStaffCapability()` for read-only page gating.
- **Access policy.** Suspended/archived profiles lose staff access. The
  security root is the `manage_roles` capability (seeded on the system Admin
  role, migration 0064, never editable from the UI). All role/capability/
  account-type writes go through `lib/access/roles.ts`, which refuses
  self-grant, revoking the last root holder, and changing your own status.
- **Module gating.** `lib/nav/modules.ts` `ModuleDef.capability` hides a module
  from the rail and `app/admin/layout.tsx` redirects direct hits. Add the
  capability there, not in the page.

## Server actions

- Parse FormData with `lib/forms.ts` (`str`, `id`, `int`, `cents`, `bool`,
  `dateOrNull`, `oneOfOrThrow`, …). No `Number(formData.get(...))`.
- Start with a guard (above). Money-adjacent actions use
  `requireStaffCapability('pay' | 'score_entry' | 'roster_sensitive' | …)`.
- Business logic lives in `lib/**`; actions only parse, guard, call, revalidate.

## Database access

- `supabaseAdmin()` (service role) only on the server. supabase-js never
  throws, so wrap every result: `ok(res, ctx)` (throw on error), `must(res,
  ctx)` (throw on error or missing row), `rows(res, ctx)` (throw on error,
  `[]` default). Use `.maybeSingle()` when absence is possible.
- **Preconditions, not read-then-write.** State flips carry their expected
  current state in the `update` (`.eq('status', 'pending').select('id')`) and
  check that a row came back. Examples: installments paid/failed, refunds
  (withdrawal is the gate), contest awards, challenge awards, coach confirms.
- **Uniqueness in the DB** for anything that must happen once: wheel spins per
  tier, one contest score per family, webhook event ids, scheduled sends.
- Toronto wall time → instant: `torontoInstant(date, 'HH:MM')`. Never a
  hard-coded `-04:00`/`-05:00`. Display with the `fmt*` helpers in
  `@ai/foundation/dates` (`fmtTime`, `fmtDate`, `fmtDateOnly`, `fmtDateTime`,
  `fmtRange`). Money with `formatCAD`.

## API routes (`app/api/**`)

- `lib/api/handlers.ts`: `cronRoute(fn)` (fails closed in production,
  constant-time secret compare), `secretRoute(header, envVar, fn)` for
  server-to-server callers, `devOnlyRoute(fn)`, `jsonError`, `readJson`.
  Every cron exports `maxDuration = 300` and is idempotent when re-run.
- Webhooks claim the provider event id in `webhook_events`
  (`lib/api/webhooks.ts#claimWebhookEvent`) before dispatching, and return
  non-2xx (releasing the claim) when a handler fails so the provider retries.
  Once-per-window sends use `claimScheduledSend(kind, windowKey)`.
- Billing events: `onBillingEvent()` subscribers registered in
  `instrumentation.ts`; `dispatchBillingEvent` returns failures.

## Programs framework (Module 4 spine)

- **One registration entry point:** `lib/programs/registration.ts#
  createRegistration()` — registrable-status gate (or staff override),
  duplicate check, derived standing, season stamp, capacity/waitlist for the
  declared scope, audit. Camps, leagues, tournaments, drop-in, Club and
  Academy all call it; the cart path applies the same rules with holds.
- **One receivable entry point:** `lib/programs/orders.ts#
  createOrderForRegistration()` for anything that is not the cart (offer
  acceptance, drop-in purchases). `waiveRemainingInstallments()` on
  withdrawal/refund. Both write `program_orders`/`program_installments`, so
  `/account/pay`, dunning, reports and the Stripe webhook see every dollar.
- **Type behaviour registry:** `lib/programs/types.ts#programType(key)` —
  capacity scope, refund engine yes/no, points, scholarships, public/admin
  hrefs. Checkout and refunds read it; pricing's seeded exclusion lists are
  asserted consistent at module load.
- Runtime enums live in `@ai/foundation/programs-core` (`PROGRAM_STATUSES`,
  `PRORATION_METHODS`, `REGISTRATION_STATUSES`, `isRegistrable`).

**Adding a program type:** add the `program_types` row (or seed), an entry in
`PROGRAM_TYPES`, a `lib/<type>/` module whose writes call
`createRegistration()` and `createOrderForRegistration()`, and pages that read
`programType(key).publicHref/adminHref`.

## Bookings (Module 2 contract)

- All bookings go through `lib/bookings.ts` (`createBooking`, `updateBooking`,
  `cancelBooking`, `createRecurringBookings`). `assertBookable` is the one
  facility rule. Many slots at once go through `createBookingsBulk`: the tree,
  the window's live bookings and the closures load once, conflicts are
  computed in memory per slot, and the rows insert in one statement (a
  200-occurrence series is ~5 queries). Recurring program sessions and rental
  series are built on it; an external calendar importer should be too.
- `bookings.source` and its presentation come from
  `@ai/foundation/bookings-core` (`BOOKING_SOURCES`, `BOOKING_SOURCE_META`).
  Owners tag rows with a typed `source_ref` (`formatSourceRef({ kind, id })`)
  and release them with `cancelBookingsBySourceRef()` — no walking owner tables.

**Adding a booking source:** add the key to `BOOKING_SOURCES` + meta, the DB
check constraint, and (if it owns rows) a `SOURCE_REF_KINDS` entry.

## Competitive / Compete

- Sport semantics are `SPORT_RULES` in `@ai/foundation/competitive`
  (ties allowed, score unit, default tiebreaks). Score entry, standings and
  the public tables read from it. Adding a sport is one entry.
- `assignSlots` enforces court capacity per (round, slot); schedules can book
  parallel games onto real court facilities via `courtFacilityIds`.
- Compete reads (`lib/compete/compete.ts`) are `cache()`-memoised per request;
  a family's `hide_from_public_rosters` removes the athlete from rosters,
  stats and profiles regardless of division settings.

## Referrals (Module 19)

`/sign-up?ref=<code>` is parked in a 30-day cookie by the middleware; the
household's first creation (`getOrCreateFamily`) records the referral; the
reward fires from `markProgramInstallmentPaid` on the referred household's
first paid installment (or at placement for a fully-covered order).

## Notifications

- `notify()` → channels; `fireTrigger()` → editable templates; the `generic`
  template accepts `bodyIsHtml` for rendered content.
- Household contacts resolve through `lib/family.ts#hohContactsForFamilies`
  (one join query), never a per-family families→profiles loop.
- Campaign sends are queued then drained within a time budget; the hourly
  `/api/cron/comms` finishes large blasts. Resend message ids are stored per
  recipient so webhook events match.

## UI kit

- `components/ui`: `PageHeader`, `Status` (pill tones), `Stat`, `EmptyState`,
  `Field/Input/Select/Textarea`, `Modal` (accessible), `Tabs`, `Toast`.
- Brand accent is `text-accent` / `border-accent` (Tailwind → `var(--accent)`),
  not an inline style. Icons are a typed union (`IconName`).

## Tests

Pure logic lives in `@ai/foundation` and is covered by `test:*` suites (`npm
test` runs them all; CI runs lint, typecheck, tests and the production build).
New pure modules get a sibling `*.test.mjs` and a `test:<name>` script; e.g.
`rentals-wizard.ts` (the booking wizard's preview arithmetic) is unit-tested so
the client preview and server billing cannot drift.

## Migrations

`supabase/migrations/NNNN_*.sql`, applied with
`node scripts/run-migration.mjs <file>`. Recent: 0064 manage_roles,
0065 promotions integrity, 0066 rental installment processing + source_ref
index, 0067 webhook_events + scheduled_send_log + campaign queue.
