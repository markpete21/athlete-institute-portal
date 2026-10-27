# ALL CAN — Design System v1.0

**Family:** The All Canadian Games (ACG)
**Sub-brand:** ALL CAN — the rep league and the circuit
**Skins:** ALL CAN Circuit (live) · ALL CAN League (slot, mark TBC)
**Style:** Swiss / editorial. Apple layout discipline. Nike / PG Lang voice.
**Numbers live in:** `all-can-tokens.css`. This document is the rulebook.

---

## 0. How to use this system

Every output made with this system passes through these rules first. When a request conflicts with them, the rules win unless the request explicitly overrides one.

The non-negotiables:

1. **Helvetica Neue only on graphics, print and video.** Regular 400, Medium 500, Bold 700. No other family, no italics, no Light or Thin weights. Web uses SF Pro (Section 4.2).
2. **Every layout sits on the 12-column grid for its format.** Every block starts and ends on a column edge. No free placement. No centred type blocks (except the roundel and single stat numerals when the layout is symmetrical by design).
3. **Left-aligned, ragged right.** Never justified. Never centred body copy.
4. **Every headline, rail block and sign-off ends in a period.** "Tip Off." "Final." "Saturday / April 4th / 2026."
5. **Red appears once per composition.** One sign-off dot, one pill, one bar, or one red word on a light surface. Never two.
6. **Red text only on light surfaces.** On dark surfaces red is a fill (dot, pill, bar), never text.
7. **Hard corners everywhere.** The only rounded elements are web pill buttons, the roundel, and the sign-off dot.
8. **No drop shadows, no gradients, no glows, no outlines on type.** Photo scrims are the only gradients.
9. **The Circuit logo is the only non-Helvetica lettering.** Never recreate its italic lettering in type. Nothing in a layout is italic or slanted.
10. **Hairlines for structure.** 1px (2px on print and screens larger than 1920).
11. **Tabular, lining numerals for every number.**
12. **Nothing from ACG's mark set, and nothing from Orangeville Prep.** See Section 1.

---

## 1. Brand architecture

| Level | Name | Role |
|---|---|---|
| Family | The All Canadian Games | Elite one-weekend all-star showcase. Heritage voice. |
| Sub-brand | **ALL CAN** | Season-long competition: the rep league and the circuit. |
| Skin | **ALL CAN Circuit** | The travelling circuit. Has its own logo (Section 9). |
| Skin | **ALL CAN League** | The rep league. Mark and name TBC. Uses the ALL CAN spine until it arrives. |

**Spine and skin.** The spine is shared by everything: grid, type, colour roles, voice, components. A skin only swaps the logo and the sign-off. Sponsor skins (for example a title partner) may swap the accent colour on photo monotones only; the red stays everywhere else.

**How ALL CAN differs from ACG.** ACG is ceremony: one weekend, invite-only, "Honour Our Past." ALL CAN is competition: every week, every team, every age group. ALL CAN leans harder on the grid and on data (standings, scores, schedules, rosters). ALL CAN's voice is present-tense and earned, not legacy.

**Never used on ALL CAN** (these belong to ACG or OP):
- ACG marks: the "ALL CANADIAN GAMES" circular wordmark, the snow-capped ACG letters, the CANADIAN wordmark, the ACG gothic numerals ("26"), the coordinate roundel.
- ACG lines: "Ball Up Top.™", "All Canadian.™", "Celebrate Our Present. / Honour Our Past. / Build Our Future."
- ACG motifs: the big-circle field, the 45° diagonal roster, serif display type.
- Orangeville Prep: Mega Black, Trophy Gold (PANTONE 8383 C), Inter, JetBrains Mono, the dot field, the OP marks.

The snowflake-ball icon inside the Circuit roundel is the family link. It is allowed because it is part of the ALL CAN Circuit logo artwork.

---

## 2. Colour

### 2.1 Palette

| Token | Ink | Hex | Print | Role |
|---|---|---|---|---|
| `--ac-red` | PANTONE 186 C | #CE112D | Spot 186 C | The one accent. |
| `--ac-ink` | PANTONE 419 C | #212322 | Spot 419 C | Default dark surface. Type on light. |
| `--ac-silver` | PANTONE 422 C | #9FA1A2 | Spot 422 C | Secondary type on dark, labels, credits. |
| `--ac-panel` | Process | #C7C8C8 | C21 M17 Y17 K0 | Light panel. |
| `--ac-paper` | Process | #EAEAEA | C7 M5 Y5 K0 | Default light surface. |
| `--ac-white` | Process | #FFFFFF | C0 M0 Y0 K0 | Type on dark. Editorial pages. |
| `--ac-black` | Process | #000000 | C70 M50 Y30 K100 | Print full-bleeds and photo scrims only. |

Web only: Cool Gray 11 C #53565A (dark page surface) and Cool Gray 9 C #75787B (non-text surfaces).

Logo only, never layout colours: roundel fill #02050A (Nike Flat Black spot), CIRCUIT wordmark fill #FCFCF9.

The hex values are the ACG26 file's own Lab ink values converted to sRGB, so ALL CAN matches every existing ACG post on screen. Pantone publishes #C8102E for 186 C; do not use it, it will not match.

### 2.2 Approved pairings (WCAG contrast)

| Type | Surface | Ratio | Use |
|---|---|---|---|
| White | Ink | 15.8 | Primary. |
| Silver | Ink | 6.1 | Secondary lines, affiliations, body on dark. |
| Ink | Paper | 13.1 | Primary on light. |
| Cool Gray 11 | Paper | 6.1 | Secondary on light. |
| Red | Paper | 4.7 | The one red word or line on light. |
| White | Red | 5.6 | Pill buttons, red bars. |
| White | Cool Gray 11 | 7.4 | Web dark pages. |
| Red | Ink | **2.8 — not allowed as text** | Red is a fill on dark. |
| White | Cool Gray 9 | **4.4 — not allowed for body** | Cool Gray 9 is a non-text surface. |

### 2.3 Surface rules

- Graphics default to **Ink with grain**. Light graphics use **Paper**. Editorial photo essays use **White**.
- Alternate dark and light slides in carousels when the content changes type (for example schedule → standings).
- Rich black is for print full-bleeds and photo scrims. It is never a flat graphic background on screen.

---

## 3. Grid and formats

All grids are 12 columns on an 8px baseline. Every artboard gets one format class from the tokens.

| Format | Size | Margin X | Margin top / bottom | Gutter | Column | Use |
|---|---|---|---|---|---|---|
| `.ac-landscape` | 1920×1080 | 120 | 96 / 96 | 24 | 118 | YouTube, slides, venue screens, broadcast, thumbnails. |
| `.ac-portrait` | 1080×1440 | 72 | 96 / 96 | 24 | 56 | Instagram feed (3:4), carousels. |
| `.ac-story` | 1080×1920 | 72 | 250 / 340 | 24 | 56 | Stories, Reels covers, TikTok. |

**Safe zones**
- Portrait: all type inside y 45–1395 so a 4:5 centre crop never cuts it. The 96px margins already guarantee this.
- Story: nothing above y 250 or below y 1580 (Instagram UI). Reels covers and video: keep type clear of the right 120px.
- Photos and surfaces always bleed to the canvas edge. Only type obeys margins.

**Column spans to reach for**

| Split | Portrait / Story | Landscape | Use |
|---|---|---|---|
| Label / content | 1–6 / 7–12 | 1–6 / 7–12 | The default. Titles and labels left, content starting at the centre line (matches the web build). |
| Rail | 1–2 mark · 3–5 · 6–8 · 9–12 | same | Header and footer rails. |
| Two-up | 1–6 · 7–12 | 1–6 · 7–12 | Two-column rosters, Boys / Girls, Scouts / Coaches. |
| Data | 1–3 label · 4–12 table | 1–4 · 5–12 | Standings, stat tables. |
| Feature | 1–8 headline · 9–12 meta | 1–7 · 9–12 | Hero headline with side metadata. |

---

## 4. Typography

### 4.1 Graphics, print, video — Helvetica Neue

| Role | Class | Weight | Landscape | Portrait | Story | Leading | Tracking |
|---|---|---|---|---|---|---|---|
| Stat numeral | `.ac-stat` | Bold | 220 | 176 | 200 | 0.85 | −0.04em |
| Display | `.ac-display` | Bold | 160 | 120 | 136 | 0.90 | −0.035em |
| Headline | `.ac-headline` | Bold | 88 | 72 | 80 | 0.92 | −0.03em |
| Rail | `.ac-rail` | Bold | 36 | 32 | 36 | 0.92 | −0.02em |
| Sub-head | `.ac-sub` | Medium | 36 | 32 | 36 | 0.92 | −0.02em |
| List | `.ac-list` | Regular + Bold names | 30 | 26 | 30 | 1.20 | −0.01em |
| List dense | `.ac-list-dense` | Regular + Bold names | 20 | 18 | 22 | 1.20 | 0 |
| Body | `.ac-body` | Regular | 26 | 22 | 26 | 1.25 | 0 |
| Label | `.ac-label` | Bold | 18 | 16 | 18 | 1.20 | 0 |
| Stat unit | `.ac-stat-unit` | Regular | 20 | 18 | 20 | 1.0 | 0 |
| Micro | `.ac-micro` | Bold, UPPERCASE | 13 | 12 | 13 | 1.30 | +0.04em |

**Rules**
- Three weights only. Bold carries hierarchy, Regular carries information, Medium sits between (sub-heads, table data, secondary rail lines).
- Headlines are one to four words. Title Case for proper nouns and event names, sentence case for statements ("Punch your ticket.").
- Stack headlines and rail blocks with manual line breaks. Rail lines hold a maximum of 11 characters in a 3-column block.
- UPPERCASE is only for micro text (credits, editorial captions). Never for headlines.
- Body copy never exceeds 46 characters per line and never goes below the label size.
- A layout uses at most four type sizes.

### 4.2 Web — SF Pro

SF Pro cannot be self-hosted (Apple licence). Use the system stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`. Apple devices render SF Pro; everything else falls back to Helvetica Neue.

| Role | Size | Weight | Leading | Tracking |
|---|---|---|---|---|
| H1 | 66 (clamp 40–66) | Semibold 590 | 1.0 | 0 |
| H2 (stacked "Our / History.") | 32 (clamp 26–32) | Semibold 590 | 1.0 | 0 |
| H3 | 20 | Semibold 590 | 1.2 | 0 |
| Body | 17 | Regular | 1.41 | 0 |
| List rows | 15 | Regular | 1.33 | 0 |
| Label / section head | 13 | Semibold 590 | 1.3 | 0 |
| Kicker, coordinates, vertical credit | 11 | Regular, tabular | 1.3 | +0.02em |
| Footer wordmark | 48 (clamp 36–48) | Semibold 590 | 0.95 | 0 |

Web runs on one family. There is no monospace on ALL CAN.

---

## 5. Layout grammar

Every graphic is built from the same zones, top to bottom.

### 5.1 Header rail (top margin)
Roundel in columns 1–2, sized to the height of a three-line rail block. Then up to three stacked rail blocks at columns 3–5, 6–8 and 9–12.

Block order: **who → when → where.**
```
[roundel]  ALL CAN        Saturday       Athlete
           Circuit.       April 4th      Institute.
                          2026.
```
- Block 1 is always the brand or event name.
- Block 2 is always the date (and time on its own line if needed).
- Block 3 is venue, broadcast, division, or the post type ("Final Score.", "Standings.").
- Two blocks is fine. Four is never allowed.

On list-heavy posts the rail stacks vertically in columns 1–6 (brand / date / title), and body copy sits in columns 7–12 under a strong hairline. This matches the ACG Selection Committee layout.

### 5.2 Content zone
The middle of the canvas. One job per slide: a photo, a stat stack, a list, a table, or a headline. Never two.

### 5.3 Footer rail (bottom margin)
Data blocks in columns 1–6, sign-off in columns 7–12 aligned right.

ALL CAN's footer rail carries **functional information**, not a manifesto: season, division, location, or a CTA line ("Registration Open."). It never carries the ACG pillar line.

### 5.4 Split (web and text-heavy graphics)
Label or stacked title in the left half. Content starts at the centre line (column 7). This is the Apple / web-build structure and is the default for anything with more than two lines of copy.

---

## 6. Components

**Roundel mark.** Circuit roundel, header rail slot. Never rotated, never outlined, never placed on a busy part of a photo.

**Rail block.** Bold, stacked, 3 lines maximum, ends in a period. Secondary line in Medium or Silver when needed.

**Sign-off.** Red dot + Bold text at rail size, footer rail columns 7–12, right-aligned, never wraps. The dot is the one red moment on a dark composition.
- Circuit: `● Where Names Get Made.` *(recommended, pending approval — do not add ™ until cleared)*
- League: TBC.

**Section head.** Bold label with a full-width strong hairline under it, 16px padding. Starts every list, table or text section.

**List row.** `Bold Name – Regular Affiliation`, a spaced en dash, 1px hairline between rows. Two columns maximum on portrait and story, three on landscape.

**Roster block.** A team header (`U15 Boys: Team Name`) as a section head, then list rows. Two-up on portrait.

**Numbered row (schedules).** Index `001` in Medium Silver · day in Bold (left) · venue in Bold (right-aligned), strong hairline, then event lines in Regular with times right-aligned.

**Table (standings, stat leaders).** Header row in Label Bold; data in Medium; team names in Regular; rank column in Silver. Hairline between rows, no vertical rules, no zebra stripes. Numbers right-aligned in their columns.

**Stat stack.** An L-bracket label (`Team Name` + hairline) above stacked stat numerals in Bold with Regular units (`PTS`, `REB`, `AST`). Three stats maximum.

**Scoreline.** Two team rows, each: team name (Bold, left) and score (Stat or Headline, right-aligned, tabular). The winner's row is White, the other Silver. The label "Final." sits in the header rail block 3.

**Vertical credit.** UPPERCASE micro, rotated 90° reading bottom to top, on the right margin: `PHOTOGRAPHY BY / NAME`. Nameplate variant: `Name / Team / City, PROV` in Regular at label size.

**Editorial caption.** Numbered, UPPERCASE micro Bold, below the photo, left-aligned to the photo edge:
```
1
NAME OF TEAM OR SCHOOL

PHOTOGRAPHY BY
NAME
```

**Lane rule (ALL CAN signature).** Three straight 1px hairlines 8px apart, derived from the Circuit logo's speed lines. Used as a section divider, above the footer rail, or as the base of a scoreline. Always horizontal, always full column span, never slanted, never red.

**Pill button (web only).** 44px minimum height, Semibold 15px. Filled red (primary) or 1px outline (secondary). One red pill per view.

**Accordion (web).** Year or division rows with chevrons, hairlines between. Native `<details>`.

---

## 7. Texture and motifs

- **Grain** on every flat Ink or Paper surface, about 7% overlay. It is the only texture.
- **Lane rules** are the only graphic motif.
- No big circles, no diagonals, no dot fields, no patterns, no icons (except the roundel), no emoji in graphics.

---

## 8. Photography

**The four treatments** (one per composition):
1. **Full colour, graded dark and moody.** Crushed blacks, controlled highlights, natural skin.
2. **Black and white.** A colour logo or single red element allowed on top.
3. **Red monotone.** Photo mapped from Ink to Red. For heroes and announcements.
4. **Ink monotone.** Photo mapped from Black to Silver. For text-heavy slides with a photo underneath.

**Rules**
- Photos bleed to the canvas edge. No borders, no frames, no rounded corners (except editorial pages, where photos sit inside the grid on White with gutters).
- Faces are never covered by type. Type sits in the negative space, on the grid.
- Use a bottom or top scrim when type sits on a photo. No text boxes, no bars behind type.
- Action and portrait both work. Low angles, gym lights, scoreboard glow.
- Credit every photo (vertical credit or editorial caption).

---

## 9. Logo — ALL CAN Circuit

**Files**

| File | Use |
|---|---|
| `ALLCAN-Circuit-Primary-OnLight` | Full lockup on Paper, White, Panel. |
| `ALLCAN-Circuit-Primary-OnDark` | Full lockup on Ink, Black, dark photos. *(Derived: ALL CAN line recoloured white.)* |
| `ALLCAN-Circuit-Wordmark-OnLight` | CIRCUIT without the ALL CAN line. Only where ALL CAN already appears nearby. |
| `ALLCAN-Circuit-Mono-Black` | Single colour on light: embroidery, stamps, one-colour print. |
| `ALLCAN-Circuit-Mono-White` | Single colour on dark or on Red. *(Derived.)* |
| `ALLCAN-Roundel-Primary` | Compact mark: header rail, avatar, favicon, watermark. *(Derived.)* |
| `ALLCAN-Roundel-Mono-White` / `-Mono-Black` | Compact mark, single colour. *(Derived.)* |

PDFs are the masters. PNGs are exported from the PDFs at 600dpi, transparent, sRGB.

**Rules**
- **Full lockup:** heroes, end cards, event posters, sign-off slides, venue screens. It spans 4–6 columns.
- **Roundel:** header rail and anywhere below the lockup minimum size.
- **Clear space:** the cap height of the ALL CAN line on all sides.
- **Minimum size:** lockup 180px wide on screen, 1.5 in wide in print. Below that, use the roundel. Roundel minimum 48px on screen, 0.4 in in print.
- **Never:** recolour (except the approved mono versions), stretch, rotate, outline, add effects, place on busy photo areas, or set the word CIRCUIT in type.

---

## 10. Voice and copy

**Tone.** Nike / PG Lang. Minimal words, maximum weight. Present tense. Confident, never boastful. Cultural, never corporate. If a line feels try-hard, cut it.

**Headline patterns**
- One word: `Final.` `Tip Off.` `Undefeated.` `Earned.`
- Two to four words: `Next Game.` `Season Two.` `Punch your ticket.` `Registration Open.`
- Numbers do the talking on stat posts: `31 PTS` and nothing else in the headline slot.

**Formatting conventions**

| Thing | Format | Example |
|---|---|---|
| Brand name | Always caps, two words | ALL CAN · ALL CAN Circuit (never AllCan, All Can, ALLCAN) |
| Date (stacked) | Day / Month + ordinal / Year. No commas. | Saturday / April 4th / 2026. |
| Date range | Unspaced em dash | April 3rd—5th 2026. |
| Time | Lowercase, no space, zone | 7:30pm ET |
| Inline metadata | Middle dot with spaces | Athlete Institute · Court 2 · 7:30pm ET |
| Score | En dash | 84–79 |
| Record | En dash | 12–3 |
| Division | U + age + gender | U15 Boys · U17 Girls |
| List row | Spaced en dash | Jordan Charles – Team Name |
| Editorial caption | UPPERCASE, "OF" | CHRISTOPHER KUMU OF FORT ERIE INTERNATIONAL ACADEMY |
| Nameplate | Name / Team / City, PROV | Sean Blake / Royal Crown School / Mississauga, ON |
| Location | City, PROV | Mono, ON |
| Trademark | ™ only on approved lines | — |

**Captions (social).** Two to four lines. Scroll-stopping first line, details second, sign-off last. One emoji maximum. Hashtags TBC with the brand owner.

**Accuracy.** Never state a partner, broadcaster, sanctioning body or stat that has not been supplied. Leave a `[TBC]` slot instead.

---

## 11. Template library

Every template exists in all three formats unless marked.

| # | Template | Rail block 3 | Content zone | Surface |
|---|---|---|---|---|
| T01 | Event poster | Venue | Full-bleed photo (treatment 1–3), lockup optional | Photo |
| T02 | Announcement | Post type | Display headline cols 1–8, body cols 7–12 | Ink or Red monotone |
| T03 | Schedule | "Schedule." | Numbered rows, full width | Ink |
| T04 | Final score | "Final." | Scoreline over lane rule, photo top half | Photo + Ink |
| T05 | Standings | Division | Table, cols 1–12 (portrait), 5–12 (landscape) | Paper or Ink |
| T06 | Player of the game | Team | Stat stack cols 1–4, photo behind | Photo |
| T07 | Roster / team reveal | Division | Two-up roster blocks | Ink |
| T08 | Registration / tryouts | "Registration Open." | Headline, 3 detail blocks, CTA line in footer | Ink or Red monotone |
| T09 | Stat leaders | Category | Table: rank, name, team, stat | Paper |
| T10 | Editorial photo essay (portrait) | — | Photos in grid on White, numbered captions | White |
| T11 | Matchup / next game | Date | Team A vs Team B stacked, time and court in footer | Ink |
| T12 | Recap cover (story) | Event | Display headline + photo | Photo |

Carousel rule: slide 1 is the hook (photo or headline), the last slide carries the full lockup and sign-off. Everything between is data.

---

## 12. Web patterns

- 12-column grid, 1440px maximum, margins `clamp(20px, 4.4vw, 64px)`. Left half holds labels and stacked titles; content starts at column 7.
- **Surfaces:** light pages on Paper; dark pages on Cool Gray 11. Cool Gray 9 only behind heroes, cards and dividers.
- **Header:** Menu (top left), roundel (centred), nothing else.
- **Hero:** full-bleed photo, kicker + H1 + one-line sub at bottom left, vertical credit on the right edge, one red pill at bottom right.
- **Sections:** Label + full-width hairline, then content. 160px between sections on desktop.
- **Lists:** hairline rows, right half. Year and division accordions.
- **Footer:** stacked grey wordmark (Silver) on the left, two-column nav on the right half, © line in micro.
- **Menu:** left drawer on White, large nav list, Close with hairline.
- Links underlined. No icons except the hamburger, close and chevrons.

---

## 13. QA checklist (run before any export)

- [ ] Correct format class, correct canvas size.
- [ ] Every block starts and ends on a column edge.
- [ ] Only Helvetica Neue (graphics) or SF Pro (web). Only Regular, Medium, Bold.
- [ ] Four type sizes or fewer.
- [ ] Every headline, rail block and sign-off ends in a period.
- [ ] One red moment. No red text on dark.
- [ ] Type inside safe zones. No type on faces.
- [ ] Dates, times, scores, separators follow Section 10.
- [ ] Names and schools spelled exactly as supplied; the same school is spelled the same way everywhere.
- [ ] No placeholder text left in (`Lorem`, repeated dummy names, `[TBC]`).
- [ ] Photo credited.
- [ ] No ACG or OP marks, lines or colours.

---

## 14. Errors found in the source material (do not repeat)

- Dates conflict across ACG materials (April 3rd—5th on social, April 4th — 6th on the web). Always confirm dates with the brand owner.
- Em dash spaced on web, unspaced on social. ALL CAN uses unspaced.
- Placeholder rows left in live lists ("Abdullahi, Hamzah – PSA Prep" in Scouts and Awards).
- "Premiere" used as an adjective. The adjective is **premier**.
- "Toby Fornier" — correct spelling is **Toby Fournier**.
- "Monday Morning Souting Report" — **Scouting**.
- "Girl Committee Members" — **Girls**.
- "Joey Mckitterick" — **McKitterick**.
- One school spelled two ways in the same graphic (Crestwood Preparatory College / Academy; Royal Crown School / Academy).
- A team label pasted into a school field ("Fort Erie Red").
- A player's name spelled two ways across posts (Siena / Sienna).
- Four different name–affiliation separators. ALL CAN uses the rules in Section 10.

---

## 15. Open items

- ALL CAN League: name and mark.
- Sign-offs: approve `Where Names Get Made.` for Circuit; League line TBC.
- Partners: confirm whether the Nike partnership extends to ALL CAN before any Nike mark appears.
- Hashtag sets for Circuit and League.
- Divisions and age groups for each skin.
