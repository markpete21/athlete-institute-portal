# Athlete Institute — Facility & Registration Portal

## Module 2 of N: FACILITIES SCHEDULE

> This is the second foundation module. **Rentals, Programs, and Events all write their bookings into the single master schedule defined here.** It also depends on Module 1 (Accounts) for user types, roles, and subdomain access. Build the hierarchy, the booking/conflict engine, and the schedule views completely and correctly — later modules create bookings through this module's API, they do not invent their own.

---

## Project Context

Same ecosystem and stack as Module 1: **Clerk** (auth, shared SSO), **Supabase** (Postgres), **Stripe** (Canadian, PAD + cards), **Next.js** App Router on **Vercel**. Brand: black / white / gold (`#A18F60`), Helvetica Neue. PIPEDA-compliant. Mobile-first.

Two subdomains from Module 1 apply:
- **`admin.athleteinstitute.ca`** — staff-only master schedule, Gantt, booking management, TV display config.
- **`play.athleteinstitute.ca`** — public curated schedule + a signed-in family's own schedule. Tenants get read-only schedule access here.

---

## Facility Hierarchy — Flexible Tree

Model facilities as a **flexible tree of arbitrary depth**, NOT a fixed 6-level structure. Any node can have children to any depth; any branch can stop early.

- One table `facilities` with a self-referencing `parent_id` (nullable for roots), a `name`, a `type/label` (free-text or enum: City, Province, Location, Facility, Sub-Facility — informational only, does not constrain depth), display order, and a `bookable` flag.
- Example real tree:
  - Orangeville, ON → **Athlete Institute** → **Fieldhouse** → Fieldhouse Gym → Fieldhouse North → Fieldhouse North – East Basket
  - Athlete Institute → **Dome** → Dome Court 1 / 2 / 3 (each court → individual baskets)
  - Athlete Institute → **Bear Cub Coffee** (stops here — no children)
  - Orangeville Christian School → (its own facilities)
- Provide a **tree editor** in admin: add/edit/reorder/nest nodes, mark bookable, soft-delete.

### Booking level & cascade blocking

- A booking can be placed at **any level**, not just leaves.
- **Booking a node automatically marks all its descendants booked** for that time slot (book "Dome Court 1" → its baskets are booked; book "Dome" → all 3 courts + their baskets booked).
- **And upward:** booking a child makes the parent unavailable *as a whole* for that slot, but **siblings remain independently bookable.** Critical example: **Basket A booked for one thing + Basket B booked for another = the full court is now booked** (both children occupied), but each basket booking is its own record. So the conflict engine must compute availability by walking both down (descendants) and up (does an ancestor booking already occupy this?) the tree.

### One booking per node, per slot

- Each node holds **one booking per time slot.** There is no "capacity N" concept. If a space is legitimately shared (two half-court sessions), model the halves as **separate child nodes** (Basket A / Basket B) and book them independently — do not overload one node with two bookings.

---

## The Master Schedule & Booking Engine

All bookings — from **Rentals, Programs, Events, and internal bookings** — live in one `bookings` table and render on one master schedule. Fields include: facility node, start/end datetime, source (`rental` | `program` | `event` | `internal`), status (`tentative`/quote | `confirmed`), internal-vs-external flag, title, an **event logo** (image upload shown next to the title), `show_on_public_schedule` flag, and links back to the originating record (rental id / program id / etc.).

### Conflict detection & resolution

Compute conflicts using the tree-aware availability described above (descendant + ancestor + sibling logic). Rules:

1. **Quotes hold their slot.** A tentative rental quote **holds the slot** while it's out. Quotes participate in the same conflict engine as confirmed bookings: **any collision — quote-vs-quote, quote-vs-booking, or quote-vs-program — raises the conflict notification** with the resolve options below. Nothing auto-wins or silently bumps; the operator decides. When a confirmed booking collides with a quote, surface a hint recommending resolution in favor of the confirmed booking, but the choice is the operator's.
2. **All collisions → the resolve prompt.** Colliding holds/bookings do NOT silently block. The system **flags the conflict and lets the operator resolve it**, with these options:
   - **Override & delete** one booking/quote,
   - **Edit** one or both,
   - **Keep both** (explicit override — multiple holds coexist by operator choice) — allowed, and when chosen the system **schedules an email reminder** to the operator/relevant staff about the unresolved double-booking so it isn't forgotten.
3. Surface conflicts prominently on the master schedule (visual clash indicator) and in a conflicts queue.

### Recurring bookings

- Build a **recurring booking tool**: set a pattern (e.g. every Tuesday 6–8pm) with an end (until date / count) and generate the series.
- (Program-sourced recurring bookings are created by the Program builder in a later module — this module exposes the recurrence engine + API for it to call.)
- **Conflict on one instance of a series → resolve just that single date**, leaving the rest of the series intact.

### Operating hours & buffers

- Default operating hours **8:00am–11:00pm**; bookings outside are **warned/blocked but overridable** per booking. Allow per-facility override of hours.
- **Buffer toggle:** optional **setup time** before and **cleanup time** after a booking (e.g. 15 min) that the engine treats as occupied for conflict purposes. Toggleable per booking/booking-type with a sensible default.

---

## Schedule Views (admin)

- **Day / Week / Month** views, **Day as default.**
- **Gantt / resource view:** two facility columns on the left — **column 1 = parent facility** (Dome, Fieldhouse), **column 2 = child** (Dome Court 1/2/3, Fieldhouse North/South) — with **time across the top** and bookings as bars. This is the primary operational view.
- **Custom views:** let staff create and save named views scoped to **selected facilities** (e.g. "Dome only," "Tournament courts").
- **Filters**, most important first: **location, facility**, then source (rental/program/event/internal), internal-vs-external, status (tentative/confirmed).

---

## TV Display Output

Build TV displays as **web pages at unique, unguessable public URLs** (e.g. `play.athleteinstitute.ca/display/{token}` — a long random token per display) — NOT a native app, and **NOT under `admin.*`**: the staff-only hard-block on `admin.*` (Module 1) would block a logged-out TV device. Display URLs are **exempt from auth** (the unguessable token is the access control) and expose only schedule data already flagged appropriate for display. This runs on any TV via a cheap streaming device pointed at the URL (Fire Stick with a kiosk browser, Chromecast-cast Chrome tab, or a mini-PC/Raspberry Pi in kiosk mode). Display *configuration* (templates, facility scope, media) lives in `admin.*`; the rendered display itself is the public token URL. Document this setup in the README.

- **Multiple displays, template-driven.** Admin can **create display templates** and **assign a template + a facility scope to each display URL** ("one main TV, but could be more" — build for N). Each display shows only its assigned facilities.
- **Refresh:** auto-refresh **every few minutes** (polling is fine — real-time not required). Displays need zero human interaction after boot.
- **Layout:** **left panel for vertical 9:16 media**, **schedule on the right.** Media panel supports: a single image, a single video, OR a **mixed photo/video slideshow** (configurable per template).
- **Content selection:** admin selects what appears — the **whole day's schedule** AND a **"coming up in the next 4 weeks"** view, with control over what's surfaced there.
- **Per-event logo:** each booking can carry an uploaded **logo shown next to the event title** on the display.
- Brand-styled (black/gold/Helvetica Neue), readable from across a room.

---

## Public & Family Schedule (`play`)

- **Public curated schedule:** shows **only bookings flagged `show_on_public_schedule`.** Default that flag **OFF for rentals and internal bookings, ON for programs and events.** Internal ops and private rentals are hidden from the public.
- **Family schedule:** a signed-in Head of Household / family member sees **their own family's bookings and registrations** on a personal schedule view.
- **Tenants:** read-only access to the (curated) facility schedule only, per Module 1.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Hierarchy + tree editor** — `facilities` self-referencing table, admin tree editor (add/edit/reorder/nest, bookable flag, soft-delete), seeded with the real Athlete Institute tree.
2. **Bookings + tree-aware availability engine** — `bookings` table, the descendant/ancestor/sibling availability computation (incl. the two-baskets-block-the-court case), operating hours + buffer logic. Prove availability math with tests.
3. **Conflict resolution** — quotes-hold-slot logic, collision flag + resolve UI (override&delete / edit / keep-both) applying to quotes and confirmed bookings alike, confirmed-vs-quote resolution hint, keep-both scheduled email reminder, conflicts queue.
4. **Recurring bookings** — recurrence engine + API (for Programs to call later), single-instance conflict resolution within a series.
5. **Admin schedule views** — Day/Week/Month (day default), the parent/child Gantt, saved custom views, location/facility filters.
6. **TV display** — templated **public token-URL** displays (outside the admin auth gate), per-display facility scope, 9:16 media panel (image/video/mixed slideshow), whole-day + next-4-weeks content selection, per-event logos, few-minute auto-refresh. README on Fire Stick/Chromecast/mini-PC setup.
7. **Public + family schedule on `play`** — curated public view (show-on-public flag with the stated defaults), family-own schedule, tenant read-only.

### Deliverables

- Source in the existing repo (`/app`, `/components`, `/lib`, `/admin`, `/display` routes).
- A **`/lib` bookings API** the Rentals and Programs modules will import to create/read bookings and check availability — this is the integration contract; document it.
- README additions: facility tree seeding, TV display device setup, recurrence + buffer configuration.
- Tests for the availability/conflict engine (the highest-risk logic).

### Non-Functional

- Mobile-first for `play`; large-screen-optimized for `/display`.
- Availability checks must be fast enough to run live during booking creation.
- PIPEDA-compliant; public schedule leaks no private/internal booking detail.
