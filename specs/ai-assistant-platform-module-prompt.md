# Athlete Institute — Facility & Registration Portal

## Module 21 of N: AI ASSISTANT PLATFORM ("Assist")

> A shared AI core — **grounded retrieval + guardrails + brand voice + tool framework** — exposed as **three surfaces**: a **public program assistant** (built first), a **customer concierge**, and an **admin copilot**. All **read-only to start** (actions added later). Named **"Assist"**, community-first brand voice ("Play. Compete. Grow."). Uses the Anthropic API pattern, model `claude-sonnet-4-6`. Build after core data modules; public surface ships first.

---

## Project Context

Same stack. The make-or-break is **grounded retrieval** — Assist answers ONLY from live system data via tool calls (Supabase/API), never from training or invention. One shared core, three scoped surfaces.

---

## The Shared Core (build once)

- **Grounded retrieval / tool framework** — Assist answers by calling tools that fetch **live, current** data (programs, prices, ages, availability, schedules, policies, balances). **Never invents** a program, price, date, or policy. If retrieval returns nothing, it says so and hands off — it does not guess.
- **Guardrails** — scope-limited per surface (below); refuses off-topic; no hallucinated facts; no exposing data outside the caller's permission scope.
- **Brand voice** — "Assist", warm, community-first ("Play. Compete. Grow."), encouraging, plain-language. Not corporate, not salesy.
- **Fallback behavior** — first **try to clarify and move them along**; if it can't help or the question is out of scope, **point to a human** with **text / call / email** options.
- **Abuse guards** — rate limiting, off-topic deflection (public surface is internet-facing).
- **Read-only to start** across all surfaces; the tool framework is built so **actions can be added later** behind permission + confirmation.

---

## Surface 1 — Public Program Assistant (BUILD FIRST)

- Unauthenticated "**ask me anything about any program**" bar on the public portal.
- **Scope:** public catalog only — programs, prices, ages, dates, locations, policies (refund, financial aid, location/hours). **No personal data.**
- **Does:** answer catalog questions, **recommend programs** ("volleyball camp for my 10-year-old in August?"), FAQ deflection, and **drive to registration** (links).
- **Never:** invents programs/prices, accesses accounts, takes actions.

## Surface 2 — Customer Concierge (specced, phased)

- For logged-in Play families.
- **Scope:** the caller's **own household** data — schedules, balances, invoices, registrations, gallery access, "when do camp registrations open."
- **Read-only first.** Later (behind confirmation + permission): guided registration ("register Ella for the same camp as last year"), pay balance, apply points.
- Support triage — answers what it can, **escalates to staff with context attached.**

## Surface 3 — Admin Copilot (specced, phased)

- For staff/admin.
- **Scope:** org-wide data per the caller's Module 5 permissions.
- **Read-only first:** natural-language queries ("who hasn't paid Week 3 balance?"), **navigate-to-spot** (takes staff to the exact screen and **loads relevant data**), insight questions over Module 14 data.
- Later (behind permission + confirmation): draft + send actions (emails, tasks), bulk operations.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Shared core** — grounded-retrieval tool framework, guardrails, "Assist" brand voice, clarify-then-human-handoff (text/call/email), abuse guards, read-only enforcement, `claude-sonnet-4-6`.
2. **Public assistant** — catalog Q&A + recommendations + FAQ + registration links; strictly public data; no invention.
3. **Customer concierge (read-only)** — own-household schedules/balances/registrations/gallery; staff-escalation with context.
4. **Admin copilot (read-only)** — permissioned org queries, navigate-to-spot + data load, Module 14 insight questions.
5. **Actions framework (later phase)** — permission + confirmation-gated actions across customer + admin surfaces.

### Deliverables
- Source (`/app/assist`, `/lib/assist` core, per-surface configs).
- Grounded-retrieval tool layer, guardrail + fallback logic, brand-voice system prompt, human-handoff UI.
- README: retrieval architecture, per-surface scope/permissions, read-only→actions path, abuse guards.
- Tests: **no-invention** (unknown program/price → handoff, never fabricated), scope enforcement (public sees no personal data; customer sees only own household; admin scoped by permission), clarify-then-handoff path, rate limiting, read-only enforcement.

### Non-Functional
- Grounded retrieval is non-negotiable — reliability over coverage; a single hallucinated answer erodes trust in all of Assist.
- One core, three surfaces; read-only first, actions behind permission + confirmation.
- `claude-sonnet-4-6`; brand voice consistent; every query is an API call (cost + abuse guards apply).
