# ALL CAN Design System

ALL CAN is the season-long competition brand of **The All Canadian Games** family, run by **Athlete Institute** in Mono, Ontario. It covers the rep league and the **ALL CAN Circuit**. The All Canadian Games (ACG) is the one-weekend, invite-only showcase; ALL CAN is every week, every team, every age group: schedules, scores, standings, rosters, registration.

Style: Swiss / editorial, Apple layout discipline. Voice: Nike / PG Lang.

**The rulebook wins every conflict:** `guidelines/ALL-CAN-Design-System.md`. Every number lives in `tokens/` (split verbatim from `all-can-tokens.css`).

## Brand architecture

- **Family** — The All Canadian Games. Heritage voice. Not used here.
- **Sub-brand** — ALL CAN. The shared spine: grid, type, colour roles, voice, components.
- **Skin: ALL CAN Circuit** — live. Has its own logo (roundel + CIRCUIT lockup).
- **Skin: ALL CAN League** — name and mark TBC. Uses the ALL CAN spine until it arrives.

A skin swaps only the logo and the sign-off.

## Surfaces / products

1. **Graphics** — social (IG feed 1080×1440, stories 1080×1920), YouTube / slides / venue screens / broadcast (1920×1080), print. Helvetica Neue only. → `ui_kits/graphics/`
2. **Website** — SF Pro, 12-col, 1440 max. → `ui_kits/website/` (built from written rules only; no site source supplied). **All web work must follow `guidelines/web/WEB-UIUX.md`**, which applies the Athlete Institute UI/UX prompt (`guidelines/web/AI-UIUX-Prompt.md`) under ALL CAN brand rules.

## Sources

Supplied by the user (copies in `uploads/`):
- `DESIGN_SYSTEM_PROMPT.md` — Athlete Institute app UI/UX prompt (copied to `guidelines/web/AI-UIUX-Prompt.md`)
- `ALL-CAN-Design-System.md` — rulebook v1.0 (copied to `guidelines/`)
- `all-can-tokens.css` — tokens v1.0 (split into `tokens/`)
- `ALL-CAN-Specimen.html` — rules applied to templates T01, T03–T07 and end card (copied to `guidelines/source/`)
- ALL CAN Circuit logo PDFs (masters) + 600dpi PNGs; roundel PNGs
- `HelveticaNeue.ttc` — Regular, Medium and Bold extracted to `fonts/`

No codebase, Figma file or website source was provided.

---

## CONTENT FUNDAMENTALS

**Tone.** Nike / PG Lang. Minimal words, maximum weight. Present tense. Confident, never boastful. Cultural, never corporate. If a line feels try-hard, cut it. The voice is earned and current, never legacy (legacy belongs to ACG).

**Periods.** Every headline, rail block and sign-off ends in a period: `Final.` `Tip Off.` `Saturday / April 4th / 2026.`

**Headline patterns.** One word (`Final.` `Undefeated.` `Earned.`) or two to four (`Next Game.` `Season Two.` `Punch your ticket.` `Registration Open.`). On stat posts the numbers talk: `31 PTS` and nothing else.

**Casing.** Title Case for proper nouns and event names; sentence case for statements (`Punch your ticket.`). UPPERCASE only for micro text (credits, editorial captions). Brand name is always `ALL CAN` / `ALL CAN Circuit` — never AllCan, All Can, ALLCAN.

**Person.** No I / we / you manifestos. Copy states facts and commands in the imperative or declarative (`Registration Open.`, `Punch your ticket.`).

**Formatting.**
- Date stacked: `Saturday / April 4th / 2026.` — no commas
- Range: `April 3rd—5th 2026.` — unspaced em dash
- Time: `7:30pm ET`
- Inline meta: `Athlete Institute · Court 2 · 7:30pm ET`
- Score / record: `84–79`, `12–3` — en dash
- Division: `U15 Boys · U17 Girls`
- List row: `Jordan Charles – Team Name` — spaced en dash
- Caption: `CHRISTOPHER KUMU OF FORT ERIE INTERNATIONAL ACADEMY`
- Nameplate: `Name / Team / City, PROV`; location `Mono, ON`

**Sign-off.** `● Where Names Get Made.` (Circuit — pending approval, no ™). League: TBC.

**Emoji.** Never in graphics. Social captions: one maximum. Captions are two to four lines: hook, details, sign-off.

**Accuracy.** Never state a partner, broadcaster, sanctioning body, date, stat or name that was not supplied. Leave `[TBC]`. Spell names and schools exactly as supplied, the same way everywhere. Known source errors are listed in rulebook §14 (e.g. *premier* not *premiere*; Toby **Fournier**; Joey **McKitterick**).

**Never use** ACG lines ("Ball Up Top.™", "All Canadian.™", "Honour Our Past") or any Orangeville Prep material.

---

## VISUAL FOUNDATIONS

**Colour.** Red `#CE112D` (PANTONE 186 C) is the one accent and appears **once per composition** — one sign-off dot, pill, bar, or one red word on a light surface. Ink `#212322` (419 C) is the default dark surface. Silver `#9FA1A2` (422 C) for secondary type on dark. Paper `#EAEAEA` default light surface; Panel `#C7C8C8`; White for editorial pages. Rich black is for print full-bleeds and scrims only. Web adds Cool Gray 11 `#53565A` (dark pages) and Cool Gray 9 `#75787B` (non-text surfaces). Red text only on light; on dark red is a fill. Do not use Pantone's published `#C8102E`.

**Type.** Helvetica Neue only for graphics, print and video: Regular 400, Medium 500, Bold 700. No italics, no Light/Thin, no monospace, no serif. Web uses SF Pro via the system stack, Semibold 590 for headlines. Display type is Bold with tight leading (0.85–0.92) and negative tracking (−0.02 to −0.04em). At most four sizes per layout. Body max 46 characters per line. Tabular lining numerals for every number.

**Grid.** 12 columns on an 8px baseline. Landscape 1920×1080 (margins 120 / 96, col 118), portrait 1080×1440 (72 / 96, col 56), story 1080×1920 (72, safe 250 top / 340 bottom, clear right 120 on Reels). Every block starts and ends on a column edge. Left-aligned, ragged right; never centred body, never justified. Default split: labels cols 1–6, content from col 7.

**Layout grammar.** Header rail (roundel cols 1–2 + up to three stacked blocks: who → when → where) → one-job content zone → footer rail (functional data left, sign-off right). Never four rail blocks.

**Backgrounds.** Flat Ink or Paper with ~7% grain overlay (the only texture), or full-bleed photography. No patterns, no big circles, no diagonals, no dot fields, no illustrations.

**Motif.** The lane rule: three straight 1px hairlines 8px apart, derived from the Circuit logo's speed lines. Horizontal, full column span, never slanted, never red.

**Imagery.** One treatment per composition: (1) full colour graded dark and moody, crushed blacks; (2) black and white; (3) red monotone (Ink→Red); (4) ink monotone (Black→Silver). Photos bleed to the edge; no borders, frames or rounded corners (editorial pages excepted). Faces never covered by type. Gym lights, low angles, scoreboard glow. Every photo credited.

**Gradients / transparency.** Photo scrims are the only gradients (`--scrim-bottom`, `--scrim-top`). No text boxes or bars behind type on photos. No blur. Transparency appears only in hairline colours and scrims.

**Shadows, glows, outlines.** None. No inner or outer shadows anywhere.

**Corners.** Hard corners everywhere. Only rounded things: web pill buttons, the roundel, the sign-off dot.

**Borders / cards.** There are no cards. Structure comes from 1px hairlines (2px print / >1920 screens): standard at 28% opacity, strong (section heads) at 60% on dark / 70% on light. No vertical rules or zebra stripes in tables.

**Animation.** Restrained. One curve, `--ease-out` cubic-bezier(0.22, 0.61, 0.36, 1); 180 / 320 / 600ms. Fades and slides only; no bounces. `prefers-reduced-motion` disables all motion.

**Hover / press (web).** Links are underlined; hover shifts colour to Cool Gray 11 on light / Silver on dark. Pills: opacity transition on hover; no shrink, no shadow. Focus should remain visible.

**Fixed elements.** Web header is minimal: Menu top-left, roundel centred, nothing else. Menu opens a White left drawer.

---

## ICONOGRAPHY

ALL CAN uses **no icon system**. Graphics carry no icons at all — the Circuit roundel is the only mark. The web allows exactly three glyphs: hamburger, close, and chevron; in the UI kit these are built from CSS hairlines (no icon font, no SVG set, no CDN library). No emoji in graphics (one maximum in social captions). No unicode symbols as icons; the middle dot `·`, en dash `–` and em dash `—` are typographic separators only. The sign-off dot is a CSS circle, not a glyph.

Logo files (`assets/logos/`, masters in `assets/logos/masters/`, web-sized PNGs in `assets/logos/web/`):
- `ALLCAN-Circuit-Primary-OnLight` / `-OnDark` — full lockup, 4–6 columns, min 180px
- `ALLCAN-Circuit-Wordmark-OnLight` — CIRCUIT only, when ALL CAN appears nearby
- `ALLCAN-Circuit-Mono-Black` / `-Mono-White` — single colour
- `ALLCAN-Roundel-Primary` / `-Mono-White` / `-Mono-Black` — compact mark, min 48px

Circuit horizontal (`assets/logos/circuit/`, PDF masters in `circuit/masters/`). Usage rules [TBC]:
- `allcancircuit-on-white` — ALL CAN + CIRCUIT, red/black/white
- `allcancircuit-black` — ALL CAN + CIRCUIT, single colour black
- `allcancircuit-on-black` — CIRCUIT only, red/black, no ALL CAN line

**Background rule for every logo file:** the filename names the background. `-on-black` sits on black, `-on-red` on Red #CE112D, `-on-white` on white. A file with no `-on-` (e.g. `allcan-horizontal-red`, `allcancircuit-black`) names the logo colour and sits on white. Never place a file on any other background.

ALL CAN Basketball (`assets/logos/basketball/`, PDF masters in `basketball/masters/`). Usage rules [TBC]:
- Crest: `allcan-basketball-logo-crest-on-white`, `-crest-solid-on-black`, `-crest-transparent-black` (black artwork, on white), `-crest-transparent-on-black`, `-crest-transparent-on-red`
- Block: `allcan-basketball-logo-block-on-white`, `-block-on-black`
- Jersey wordmark: `allcan-basketball-logo-jersey-wordmark-red-on-white`, `-jersey-wordmark-on-red`, `-jersey-wordmark-red-on-black`, `-jersey-wordmark-white-on-black`
- On white, marks: `allcan-basketball-logo-primary-solid-on-white`, `-primary-transparent-on-white`, `-stacked-on-white`, `-stacked-solid-on-white`, `-horizontal-solid-on-white`
- On white, wordmarks: `allcan-basketball-logo-horizontal-on-white`, `allcan-basketball-logo-wordmark-on-white`, `allcan-basketball-league-logo-wordmark-on-white`, `allcan-basketball-skills-logo-wordmark-on-white`
- On black, marks: `allcan-basketball-logo-primary-solid-on-black`, `-primary-transparent-on-black`, `-stacked-on-black`, `-stacked-solid-on-black`, `-horizontal-solid-on-black`
- On black, wordmarks: `allcan-basketball-logo-horizontal-on-black`, `allcan-basketball-logo-wordmark-on-black`, `allcan-basketball-league-logo-wordmark-on-black`, `allcan-basketball-skills-logo-wordmark-on-black`
- On red, marks: `allcan-basketball-logo-primary-solid-on-red`, `-primary-transparent-on-red`, `-stacked-on-red`, `-stacked-solid-on-red`, `-horizontal-solid-on-red`
- On red, wordmarks: `allcan-basketball-logo-horizontal-on-red`, `allcan-basketball-logo-wordmark-on-red`, `allcan-basketball-league-logo-wordmark-on-red`, `allcan-basketball-skills-logo-wordmark-on-red`
- ACB: `acb-logo-balloons` (on white)

ALL CAN Sport (`assets/logos/sport/`, PDF masters in `sport/masters/`). Usage rules and the relationship to ALL CAN / Circuit [TBC]:
- Shield: `allcansport-logo-primary-solid-on-black` / `-on-red`, `allcansport-logo-primary-transparent-on-black` / `-on-red`
- Leaf + stacked: `allcan-logo-stacked-on-black` / `-on-red`
- Leaf + horizontal: `allcan-logo-horizontal-on-black` / `-on-red`
- Wordmark: `allcansport-logo-horizontal-on-black`, `allcansport-logo-horizontal-red`

Alternate logos (`assets/logos/alternate/`, PDF masters in `alternate/masters/`). **Use only when specifically requested.** Never pick one by default; the Circuit lockup and roundel remain the standard marks.
- Block: `allcan-stacked-red`, `allcan-block-red-on-black`, `allcan-block-white-on-black`, `allcan-horizontal-red`
- Grid: `allcan-grid-on-red`, `allcan-grid-on-black`, `allcan-grid-on-white`
- Script: `allcan-script-black-on-black`, `allcan-script-red-on-white`, `allcan-script-white-on-black`

Never recolour, stretch, rotate, outline, add effects, or set CIRCUIT in type. The snowflake-ball inside the roundel is the family link to ACG and is allowed only as part of the logo.

---

## Index

- `guidelines/web/WEB-UIUX.md` — required web UI/UX layer (precedence + translation table + web checklist)
- `guidelines/web/AI-UIUX-Prompt.md` — Athlete Institute UI/UX prompt, verbatim

- `styles.css` — entry point (`@import`s only)
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `formats.css` (artboard classes), `type-roles.css`, `components-graphic.css`, `web.css`
- `fonts/` — Helvetica Neue Regular / Medium / Bold (TTF, extracted from the supplied TTC)
- `assets/logos/` — Circuit lockups and roundels (PNG), `masters/` PDFs, `web/` downsized PNGs, `alternate/` alternate logos, `circuit/` Circuit horizontal logos, `sport/` ALL CAN Sport logos, `basketball/` ALL CAN Basketball logos (PNG + PDF masters)
- `guidelines/ALL-CAN-Design-System.md` — rulebook; `guidelines/cards/` — foundation specimen cards; `guidelines/source/` — original specimen
- `components/` — React primitives (below)
- `ui_kits/graphics/` — template viewer (T01–T09, T11, end card)
- `ui_kits/website/` — web click-through (home, schedule, standings, register)
- `SKILL.md` — agent skill entry
- `thumbnail.html` — project tile

### Components

Graphic components render at true pixel size and must sit inside an `Artboard`. Set `window.ALLCAN_ASSET_BASE` to the folder with the web logo PNGs.

- `components/brand/` — **Roundel**, **Lockup**, **LaneRule**, **SignOff**
- `components/layout/` — **Artboard**, **HeaderRail**, **RailBlock**, **FooterRail**
- `components/data/` — **SectionHead**, **ListRow**, **RosterBlock**, **NumberedRow**, **StandingsTable**, **StatStack**, **Scoreline**
- `components/credits/` — **VerticalCredit**, **EditorialCaption**
- `components/web/` — **PillButton**, **Accordion**

Inventory follows rulebook §6. Intentional additions: **Artboard** (applies the format class every graphic needs), **Lockup** (wraps the logo files), **RailBlock** (shared unit of header/footer rails).

## Open items (from rulebook §15)

ALL CAN League name and mark; approval of "Where Names Get Made."; whether the Nike partnership extends to ALL CAN; hashtag sets; divisions and age groups per skin.
