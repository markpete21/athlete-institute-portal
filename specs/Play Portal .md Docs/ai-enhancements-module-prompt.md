# Athlete Institute — Facility & Registration Portal

## Module 22 of N: AI ENHANCEMENTS (ambient AI across the platform)

> Seven ambient AI features that enhance their **home modules** (not chat assistants — those are Module 21). Each is defined here with where it plugs in. Model `claude-sonnet-4-6` (or purpose-appropriate models where noted). Build after the respective home modules are working.

---

## 1. Smart Scheduling (→ Module 6)

- An **AI optimization pass** over the schedule builder's soft constraints — court/time assignment balancing travel gaps, time-slot fairness (6/7/8pm distribution), ref/staff availability, peak-hour revenue, weeks off.
- AI proposes an optimized schedule; **staff review + fine-tune before publish** (never auto-publishes). Complements the existing rule-based builder.

## 2. AI Roster Generation (→ Module 6)

- **AI-assisted team balancing** — beyond the rule-based auto-balancer, AI helps distribute players across attributes (age/gender/skill/experience/height) and explains trade-offs. Pairs with the **team-balance explainer (Module 18)**. Staff approve; never auto-executes.

## 3. Auto-Draft Program Descriptions (→ Module 4)

- A **"draft with AI" button** on program creation — generates an on-brand program description from the structured program fields (type, age, dates, sport, location). Same Claude-drafting pattern as Module 13. Staff edit + approve.

## 4. Auto-Galleries by Player (→ Module 17)

- Auto-sort gallery media so each family sees **their kid's** photos/clips.
- **Two grouping methods:**
  - **Jersey-number detection** (default, less sensitive) — group by detected number.
  - **Face grouping** (opt-in only) — **facial recognition of minors is legally sensitive (PIPEDA: biometric = sensitive personal info)**; requires **explicit parent consent at registration**, off by default, with jersey-number as the non-biometric fallback.

## 5. Auto-Highlights from Live Stream (→ Module 17 + Module 6 + live-stream app)

- Auto-generate highlight clips from existing game recordings.
- **v1 (build now): scoreboard + audio driven** —
  - **Scoreboard timestamps** from Module 6 score entry mark scoring moments; clip ~10–15s around each. Cheap, reliable, reuses structured score data.
  - **Audio spikes** (crowd noise) catch big moments the scoreboard misses.
- **Per-player reels** — where score entry attributes points to a player + roster jersey numbers, auto-assemble "[Player]'s highlights" (retention + Academy recruiting asset).
- Assembly: clip → optional stitch → branded intro/score overlay → drop into Module 17 gallery for the right families.
- **Vision AI (phase 2, parked):** computer-vision event/ball detection for automatic per-player tracking without manual score attribution — capable but expensive; defer.
- Cost lives in the video-infrastructure bucket (reuses streaming pipeline).

## 6. Pricing Intelligence & Insights (→ Module 14)

- **Scope: your own data + youth-sports best-practice heuristics** (NOT external competitor benchmarking — AI can't invent real market data).
- Analyzes fill rates, demand, margin, retention to surface pricing + operational insights ("U15 volleyball fills instantly at current price — headroom to raise"; "this camp week under-enrolls every year").
- Decision-support only — **AI advises, staff decide.**

## 7. AI-Timed Nudges (→ Module 13 + Module 16)

- Optimize **send-time and content** of notifications/campaigns per family pattern — the right message (register before it fills, early-bird ending, re-enroll) at the time each family is most likely to act.
- Feeds from Module 16 retention signals + Module 13 engagement data; sends via Module 0 `notify()`.

---

## Build Stages — Go In Order (each after its home module works)

1. **Auto-draft descriptions** (Module 4) — simplest, immediate payback.
2. **AI roster generation + smart scheduling** (Module 6) — pair with existing builder + explainer.
3. **Auto-galleries** (Module 17) — jersey-number first, face grouping opt-in with consent.
4. **Auto-highlights** (Module 17) — scoreboard+audio v1, per-player reels; vision parked.
5. **Pricing intelligence** (Module 14) — own-data + heuristics insights.
6. **AI-timed nudges** (Module 13/16) — send-time + content optimization.

### Deliverables
- Enhancements wired into home modules (`/lib/ai/*`), each with staff-review-before-apply where it affects real output.
- README per feature: what it does, which module it enhances, human-in-the-loop point, cost/consent notes.
- Tests: scheduling/roster never auto-publish (staff approve), description draft on-brand, gallery face-grouping gated by consent + jersey fallback, highlight clip windows from score timestamps, pricing insights use only own data + heuristics (no fabricated market data), nudge timing.

### Non-Functional
- **Human-in-the-loop** on anything that produces public/real output (schedules, rosters, descriptions, prices) — AI proposes, staff approve.
- Face grouping opt-in + consent (PIPEDA); highlights reuse video infra; pricing is own-data-only.
- `claude-sonnet-4-6` unless a purpose-specific model fits better (vision, audio).
