# Athlete Institute Portal

Facility management + registration platform (`play.athleteinstitute.ca` public, `admin.athleteinstitute.ca` staff). Built module-by-module from the specs in [`/specs`](specs/) — read `specs/START-HERE.md`, then `specs/MASTER-build-order.md`.

## Ecosystem

Third app in the Athlete Institute family, alongside the live-stream app (`live.*`), tickets (`tickets.*`), and the cross-app hub (`apps.*`) — those three live in the separate `athlete-institute-live` repo.

**Shared across all apps:** the Clerk **production** instance (`clerk.athleteinstitute.ca`) for single sign-on, the Canadian Stripe account (cards + PAD `acss_debit`), Resend, and the `apps.*` hub for cross-app navigation + per-app admin grants.

## Architecture decisions (deliberate deviations from the specs)

1. **Own Supabase project.** The Module 0 spec assumes one shared Supabase DB across all apps; Mark chose (2026-07-22, confirmed twice) a dedicated Supabase project for the portal. Rationale: this schema is large and migration-heavy (bookings/conflicts, refunds/proration, leagues…) and must never risk the revenue-serving live/tickets DB; RLS stays simple per project. Cross-app connection is preserved via the shared Clerk identity (same `user_id`/email everywhere) — cross-app *data* reads (only Module 16 needs them) go through a small internal API or a read-only second client, not SQL joins.
2. **The `apps.*` hub is NOT built here.** Module 0 Stage 3 describes the hub, but it already exists in production (built in the `athlete-institute-live` repo: tiles, app switcher, per-app admin grants + role invites). The portal *integrates*: its chrome links to the hub, and Play/Admin tiles get added to the hub's registry (`lib/apps/registry.ts` in the live repo) when the portal is deployable.
3. **`@ai/foundation` lives in this repo** as an npm workspace (`packages/foundation`), imported by the app directly. If/when the other repos consume it, extract or publish — until then one source of truth here, documented for the others.

## Local development

This machine uses the local Node toolchain (no system Node):

```sh
export PATH="$HOME/.toolchain/node-v20.18.1-darwin-arm64/bin:$PATH"
npm install
npm run dev
```

Then open, in a Chromium browser (`*.localhost` resolves to `127.0.0.1`):

- http://play.localhost:3000 — public portal
- http://admin.localhost:3000 — staff backend
- http://localhost:3000 — defaults to play
- http://localhost:3000/display/demo-token — public TV-display token URL (auth-exempt)

`npm run build` · `npm run typecheck` · `npm run lint` — CI runs lint + typecheck on push/PR.

## Subdomain routing

`middleware.ts` resolves the request host to `play` or `admin` (`resolvePortalApp` in `@ai/foundation`) and rewrites into the matching route tree (`app/play/*`, `app/admin/*`). The host picks the tree, so `/admin/*` is unreachable from `play.*` by construction. `/display/[token]` bypasses the rewrite and (from Stage 2 on) auth — the unguessable token is the credential for facility TV displays.

### DNS (when deploying)

GoDaddy CNAMEs `play` and `admin` → `cname.vercel-dns.com`, and add both domains to the Vercel project (same pattern as `live`/`tickets`/`apps`).

## Module 0 build stages

| # | Stage | Status |
|---|-------|--------|
| 1 | Repo + `@ai/foundation` + subdomain routing | ✅ this commit |
| 2 | Clerk auth wiring (shared instance; dev keys local, prod on Vercel) | ✅ |
| 3 | Hub **integration** (tiles registered in live repo `af62a52`, internal until launch; portal chrome links to hub) | ✅ |
| 4 | Stripe rails (vaulting, PAD mandates, charges, webhooks) | ✅ |
| 5 | Brand theming (shared Vanguard system + multi-brand `--accent` layer; DB table + editor deferred to portal-Supabase) | ✅ |
| 6 | `notify()` (Resend / Twilio / web-push, brand-themed templates) | ✅ |
| 7 | Media storage (buckets, upload + signed-URL helpers) | ✅ |
| 8 | UI kit (incl. calendar/Gantt shells) + money/tax/dates/audit utilities | ✅ |

**Module 0 complete** — migration 0001 applied; audit trail + brands + storage verified against the live Supabase project.

## Module 1 — Accounts ✅ (complete)

| # | Stage | |
|---|-------|---|
| 1 | Schema + Clerk mirroring (migration 0002) | ✅ 11/11 |
| 2 | DB-backed user types + subdomain/tenant guards | ✅ 7/7 |
| 3 | Families + roles (HoH, 18+ conversion, role admin) | ✅ 8/8 |
| 4 | **Canonical pricing function** + season credits + points (migration 0003) | ✅ 30/30 + 9/9 |
| 5 | Playbook import + claim flow (migration 0004) | ✅ 10/10 |

The pricing function (`packages/foundation/src/pricing.ts`, `npm run test:pricing`) is the single owner of money math platform-wide — extend it, never re-implement (see its header for the canonical order + redemption scopes). Playbook runbook: [docs/playbook-import.md](docs/playbook-import.md).

Conventions docs (schema naming, RLS patterns, audit-log usage) land with the first schema work (Stage 4/5) as `docs/schema-conventions.md`.

## TV displays — device setup

Each display configured at `admin.…/displays` gets a **public unguessable URL**
(`play.athleteinstitute.ca/display/<token>`). The token is the access control —
treat the URL like a password (regenerate by deleting/recreating the display).
Pages auto-refresh every 3 minutes and need zero interaction after boot.

Point any of these at the URL:

- **Fire TV Stick** (cheapest): install *Fully Kiosk Browser* (or *Silk*), set
  the display URL as the start page, enable kiosk/autostart.
- **Chromecast / Google TV**: open the URL in Chrome and *Cast tab*, or use a
  kiosk app on Google TV.
- **Mini-PC / Raspberry Pi** (most reliable): boot Chromium in kiosk mode —
  `chromium --kiosk --noerrdialogs --disable-session-crashed-bubble "<url>"`.

Layout: left panel is 9:16 portrait media (single image, video, or a mixed
slideshow — per template), schedule fills the rest. Only bookings flagged
`show_on_public_schedule` ever appear.
