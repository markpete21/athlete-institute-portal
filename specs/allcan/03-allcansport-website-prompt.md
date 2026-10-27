# allcansport.ca: build prompt

> Build the ALL CAN Sport website at **allcansport.ca** as the first brand site of **Module 23 (Brand Sites)**, inside this repo. Read, in this order: `specs/MASTER-build-order.md`, `specs/brand-sites-module-prompt.md` (the platform: host routing, page builder, nav, publishing, permissions, dashboard), then this file (what ALL CAN's site contains and how it looks). Brand rules live in `specs/allcan/design-system/`. Reference material: `01-audit-website-summary.md`, `02-league-site-research.md`. Clickable prototype: https://claude.ai/artifact/RgSguZG5bqAwivJPxxSHTg (sample data, scripted Claude).

---

## 0. Decisions already made (do not re-open)

| Topic | Decision |
|---|---|
| Brand | **ALL CAN Sport**. Line: "Sport that belongs to everyone." Pillars: "Play. Compete. Grow." Covers youth and men's leagues. |
| Sport structure | **Basketball:** ALL CAN Basketball League · ALL CAN Basketball Skills · ALL CAN Circuit (rep). **Volleyball:** League · Skills. **Soccer:** League · Skills. **Flag Football:** League. Only basketball is running at launch; the others show as coming soon. |
| Hierarchy | **Location first, then sport, then league type** (youth league, adult league, youth skills, rep). |
| Locations at launch | **Toronto Midtown** at De La Salle College (basketball league + skills). **Orangeville** at Athlete Institute, Mono, ON (ALL CAN Circuit). |
| Toronto areas | **Each Toronto area is its own location** (`toronto-midtown`, later `toronto-west`, etc.), grouped under "Toronto" in the finder and menu. The area name "Midtown" is a working name, to be confirmed. |
| Registration | **Not in this build.** Program pages show live facts and an interest form ("notify me when registration opens"). Register and pay on allcansport.ca comes later with the registration platform; leave the slot in the program page. |
| Header | **Mega menu on desktop**, in brand style (hairline columns, white panel, no cards, no shadows). Phones keep the brand header: Menu left, logo centred, white left drawer. |
| Logos | **ALL CAN Sport shield** in the header. **ALL CAN Sport horizontal** in the footer. Circuit lockup on Circuit pages only. |
| Fonts | **System stack, no hosted fonts.** Apple devices render SF Pro natively; others fall back to Helvetica Neue, Helvetica, Arial. Do not serve the SF Pro or Helvetica Neue files from the brand zip; their licences don't cover web hosting. |
| Pillars display face | **"Play. Compete. Grow." is set in Futura Bold** (regular width, not condensed). Owner-approved exception to the rulebook's SF Pro-only web rule, for this line only. Load it from the visitor's device (`local()`; Apple platforms ship it), fall back to Jost Bold from Google Fonts. To show Futura on every device, license a Futura webfont (for example Futura PT through Adobe Fonts) before hosting it. |
| Live / Tickets / Gear | **Link out only.** Shop goes to gear.athleteinstitute.ca. |
| Claude | Three features: **Write with Claude** block, **Build a page with Claude**, and **Ask ALL CAN** for visitors (answers only from published facts, hands off to staff). |
| Editor | Site dashboard, page builder with the Claude block, navigation and mega-menu editor, site settings. All from Module 23. |

---

## 1. Brand rules that shape the build

The rulebook (`design-system/guidelines/ALL-CAN-Design-System.md`) and tokens win every conflict. Web behaviour follows `design-system/guidelines/web/WEB-UIUX.md`, which applies the Athlete Institute UI/UX prompt with the ALL CAN translation table. The key rules for this site:

- **Colour.** Red `#CE112D` is the one accent and appears **once per view**: one red pill, one red word on light, or the leaf inside a logo. Ink `#212322` for dark surfaces and type on light. Paper `#EAEAEA` is the default page ground; White for editorial pages and the mega panel and drawer. Cool Gray 11 `#53565A` for secondary text on light. Red text only on light surfaces; on dark, red is a fill.
- **Header and footer on black.** The ALL CAN Sport shield and horizontal files exist only as `-on-black` and `-on-red` versions, and the rulebook says a logo file sits only on the background its filename names. So the header and footer are `#000000`. Everything else follows the surface rules.
- **Pillars line.** "Play. Compete. Grow." uses the display face from §0 (Futura Bold, weight 700, leading about 0.94). Nothing else on the site uses it.
- **Type.** Semibold (600) headlines with tight leading; at most four sizes per layout; tabular lining numerals everywhere; body lines no wider than about 60 characters. Every headline ends with a period ("Locations." "This week.").
- **Grid.** 12 columns, 1440 max, margins `clamp(20px, 4.4vw, 64px)`. Labels and stacked titles in the left half; content from column 7.
- **No cards, no shadows, no rounded corners** except pill buttons and status pills. Structure comes from 1px hairlines: standard at 28% Ink, strong at 70%. Tables have no vertical rules and no zebra stripes.
- **Motif and texture.** The lane rule (three 1px hairlines 8px apart) is the only motif. Ink surfaces carry a ~7% grain. No gradients except photo scrims, no patterns, no illustrations.
- **Glyphs.** Hamburger, close and chevron only, drawn from CSS hairlines. No icon set, no emoji.
- **Photography.** Full-bleed, one treatment per composition, faces never covered by type, every photo credited. Until real photos exist, use Ink with grain and a "Photo [TBC]" credit. Never use stock or another brand's images.
- **Copy formats.** Dates stacked: `Saturday / April 4th / 2026.` Times: `7:30pm ET`. Scores and records with an en dash: `84–79`, `12–3`. Inline meta with middle dots: `De La Salle College · Court 2 · 7:30pm ET`. Brand name always `ALL CAN` / `ALL CAN Sport`.
- **Accuracy.** Never state a date, price, age group, coach, partner or stat that wasn't supplied. Show `[TBC]` in admin and hide unconfirmed rows from the public page once the site is live (see §6.4).
- **Never** use All Canadian Games or Orangeville Prep marks, lines, colours (Trophy Gold), Inter, JetBrains Mono or the dot field.

Implement the brand as the Module 23 **theme pack** `packages/foundation/src/themes/all-can/` with renderers in `components/site/themes/all-can/`. Tokens come from `design-system/tokens/` minus the font files. Logos ship from the public `brand-assets` bucket under `sites/all-can/` (raster only), resized for web.

---

## 2. Site map and URLs

```
/                                   Home
/locations                          Finder: every location grouped by city, with status; request-a-location form
/[location]                         Location hub, e.g. /toronto-midtown, /orangeville
/[location]/[sport]                 Sport at a location, e.g. /toronto-midtown/basketball
/[location]/[sport]/[program]       Program page (later, with registration), e.g. /toronto-midtown/basketball/league
/[sport]                            Sport overview, e.g. /basketball, /volleyball (coming soon)
/circuit                            ALL CAN Circuit (rep)
/scores                             Compete: schedule and results
/standings, /standings/[division]   Compete: standings
/teams, /teams/[team]               Compete: teams and team pages
/players, /players/[player]         Compete: player directory and profiles
/training                           Skills sessions + private instruction
/stories, /stories/[slug]           Newsroom
/parent-guide                       How it works, placement, what to bring, policies
/financial-assistance               Policy, limits, outside programs, confidential request
/about                              About ALL CAN Sport, operator, contact
```

Location slugs are unique site-wide. Toronto areas are separate locations with a shared `city = "Toronto"` used for grouping in the finder and the Locations mega menu. Add a `locations` concept to `brand_sites` content (or reuse Module 2's facility tree with a `public_location` record) holding: slug, name, city, venue, address, parking, arrival, contact, local social link, status (`open`, `opening_soon`, `waitlist`, `closed`), and the sports offered. Programs link to a location through their venue.

---

## 3. Navigation

Desktop header, left to right: **shield** (links home) · **Locations ▾ · Sports ▾ · Scores & Standings ▾ · Training · Stories · Families ▾ · Shop** · Sign in · **Ask ALL CAN** (outline pill).

| Root | Type | Mega menu columns |
|---|---|---|
| Locations | folder | **Browse:** All locations, Request a location. **Toronto:** Toronto Midtown · De La Salle College. **Orangeville:** Orangeville · Athlete Institute. Featured: the newest location. |
| Sports | folder | **Basketball:** League, Skills, Circuit. **Volleyball:** League, Skills (soon). **Soccer:** League, Skills (soon). **Flag Football:** League (soon). Featured: Basketball. |
| Scores & Standings | folder | **Compete:** Scores and schedule, Standings. **Teams and players:** Teams, Players. Featured: this week's games. |
| Training | page | – |
| Stories | page | – |
| Families | folder | Parent guide, Financial assistance, About ALL CAN Sport, Contact. Featured: Parent guide. |
| Shop | link | gear.athleteinstitute.ca, new tab |

The menu is the Module 23 `site_nav_items` tree: root → folder → folder → page/link at most. In the mega panel, a root folder's child folders become columns; loose pages form a "Browse" column; a featured slot shows one promo with its line. Opens on hover with a pointer and on click or Enter for keyboard; Escape closes; focus returns to the trigger.

Phones: black bar with Menu (hamburger + word) on the left and the shield centred. Menu opens the white left drawer: root items as large rows, folders as accordions with their columns as subheads, then Ask ALL CAN and Sign in.

Footer (black): ALL CAN Sport horizontal logo and "Operated by Athlete Institute." on the left; two columns on the right (ALL CAN Sport links; Families links; then Watch, Tickets and Shop link-outs); legal line in micro caps with the photo credit.

---

## 4. Pages

### 4.1 Home
1. **Hero** (Ink, full-bleed photo when available): no kicker and no lane rule above the headline. H1 "Play. / Compete. / Grow." in the pillars display face, line "Sport that belongs to everyone.", one red pill **Find your location** → `/locations`. Vertical photo credit on the right edge.
2. **Locations**: "Choose where you play." Hairline rows, one per location: name, venue and address, status pill, chevron. Last row: "Your area" → request a location.
3. **Sports**: four columns in hairline rows; each lists its leagues; status "Now playing" or "Coming soon".
4. **Scores** (Compete): "This week." Last results and next games for every published division. Link to full schedule.
5. **How it works**: skills block → gameplay → progress, three hairline rows. Link to the parent guide.
6. **Families**: Parent guide, Financial assistance, Ask ALL CAN.

### 4.2 Locations finder
Grouped by city, then location rows with venue, address, sports and status. A **Request a location** form: area or city, sport, email, consent checkbox. Requests feed the dashboard and a `notify()` list.

### 4.3 Location hub (`/toronto-midtown`)
Page head with status. Sections: **Venue** (name, address, parking, arrival, contact, local social link) · **Sports here** (each sport offered, plus the others as "not offered here yet") · **Season calendar** (registration opens, placement, jerseys, first session, last session) · **Coaches** (names and roles from `program_staff`, screening statement) · **Scores** at this location (Compete, filtered).

### 4.4 Sport at a location (`/toronto-midtown/basketball`)
Every program of that sport at that location, each as a **program block**:
- Kicker: league type · location. H2: program name. Status pill.
- **Fact block** generated from the program record, in this fixed order: Ages (or birth years) · Format · Day and time · Season (with year) · Venue · Price (taxes shown) · What's included · Spots left · Registration opens.
- A line linking financial assistance beside the price.
- Right column: the **interest form** while registration is closed (parent email, child's age group, consent; "This doesn't hold a spot."). When registration is live (later build), this slot becomes the Register action and the full program page.
- Then a short FAQ (placement, what to bring, attendance, weather) from the parent guide.

### 4.5 Sport overview (`/basketball`)
Pathway rows: Skills → League → Circuit, each with its role and link. "Where to play" rows per location. **Age-adapted play** fact block (ball size, rim height, game format by age group), with `[TBC]` until confirmed. Coming-soon sports (`/volleyball`, `/soccer`, `/flag-football`) show their leagues and an interest form.

### 4.6 ALL CAN Circuit (`/circuit`)
Ink hero with the Circuit lockup (on-dark file), kicker "ALL CAN Basketball · Rep · Orangeville", H1 "The Circuit." Program block for the Circuit (divisions, selection, home venue, events). Events list (stop, date, venue, divisions) feeding Compete.

### 4.7 Compete pages
See §5.

### 4.8 Training
**Skills sessions:** the ALL CAN Basketball Skills program block. **Private instruction:** formats table (1:1, partner, small group; ages, length, rate), taxes and cancellation rules, coaches, and a **request form** (format, goals, email) with a stated response time and the line "A request isn't a confirmed booking."

### 4.9 Stories
List filtered by type (Announcement, Feature), location and sport. Each row: type, date, location, title, first line. Story page: date, author, location and sport in a fact block on the left; body on the right; link to the related program. Launch set: the ALL CAN Sport launch, the Toronto Midtown opening, and how the skills block works.

### 4.10 Parent guide
One accordion page: how a session works · placement and teams · what to bring · uniforms · attendance · weather and cancellations · refunds · photos and consent · code of conduct. Each answer shows the confirmed rule and marks what's still `[TBC]`. Footer "Policies" links here.

### 4.11 Financial assistance
ALL CAN's policy as a fact block (covers, award limits, reviewer, response time, appeals). Rows linking **KidSport Ontario** and **Canadian Tire Jumpstart**. A **confidential request form** collecting only name, email, program and an optional note; stored apart from program and coach data with access limited to the reviewer role.

### 4.12 About
Structure (four sports and their leagues), operator ("Operated by Athlete Institute"; Orangeville Prep and the All Canadian Games keep their own sites), and **Contact** (email, phone, response time; registration and cancellations always through this contact, never social messages).

---

## 5. Compete inside the site

Everything here reuses Module 23 §3.2: shared Compete components, `brandKey` filters in `lib/compete`, name masking and `show_on_compete` untouched, Compete's own site stays the cross-brand index with canonical links pointing here.

- **Filters everywhere: location first, then division.** Add a `locationSlug` filter to `listDivisions`, `upcomingGames` and the standings query (division → program → venue → location).
- **Scores** (`/scores`): grouped by date heading in the brand date format, venue under the heading, then game rows: time and court · home team, score or "vs", away team (winner in semibold) · status pill (Final, Upcoming, Postponed). Team names link to team pages.
- **Standings** (`/standings`): division tabs as pills; table with #, Team, GP, W, L, PF, PA, Diff, Streak; tie-break note under the table.
- **Teams** (`/teams`): location and division filters; hairline rows with name, location, record, coach. **Team page**: record in the lede, **Follow this team**, roster grid, schedule and results.
- **Players** (`/players`): search by display name, filters for division and team; portrait grid (panel-coloured 4:5 tiles, initials when there's no consented portrait, jersey number top right). Only players with guardian permission appear; masked players show as "Team member" on rosters and never get a profile.
- **Player profile**: portrait, number, team, division, location, a short player-approved introduction; stats only where the division records them (`statsEnabled`).
- **Follow this team**: signed-in families (Clerk satellite on allcansport.ca) follow a team; schedule changes, postponements and final scores go out through `notify()` using the family's channel preferences. Store follows in a new `team_follows (profile_id, team_id)` table.
- Privacy is unchanged from Compete: no birth dates, schools, contact details or private evaluations on any public page.

---

## 6. Editor

All from Module 23 §7, with these ALL CAN specifics.

### 6.1 Dashboard
KPIs: visitors, page views (Vercel Web Analytics, filtered to allcansport.ca), registrations (shows "Not connected yet" until registration is live), **interest sign-ups** by location and sport. Panels: traffic sparkline and top pages; **page tree** with Page, Folder and Link tags, publish state and an Edit link per page; content counts (published, unpublished changes, drafts, hidden); Compete activity (divisions, teams, games this week, most-viewed standings).

### 6.2 Page builder
Three columns: page list · block stack · block settings. Each block row shows its type and summary with Up, Down, Hide and Delete. **Add block** opens a picker grouped as Claude · Content · Locations & programs · Compete · Media · Layout. ALL CAN-specific block types beyond Module 23's set: **Location list**, **Sport list**, **Fact block** (bound to a program or location record), **Season calendar**, **Interest form**. Header actions: Build a page with Claude, Preview draft (opens the page on allcansport.ca with a "Draft preview" bar), Publish (the one red action).

### 6.3 Navigation editor
Tree with Up, Down, Indent and Outdent. Indent refuses a third folder level with the message "That would make the menu three folders deep. Menus allow a dropdown and one more level inside it." Item settings: label, type (page, folder, link), the linked page or address, the mega menu line for folders, hide from menu. A live desktop preview shows the selected root's mega panel. **Publish menu** applies it to the site.

### 6.4 Site settings
Launch switch (Off · Coming soon · Live) with its go-live checks; domains (allcansport.ca verified, www redirects, sign-in ready); search and sharing defaults; contact and link-outs; editors (Site Editor role scoped to ALL CAN); **Ask ALL CAN** on/off and its hand-off contact.

**`[TBC]` handling:** in the editor and in previews, unconfirmed facts show as `[TBC]`. On the live site, a fact block row whose value is still `[TBC]` renders as "To be confirmed" in Cool Gray 11, never as raw brackets. The go-live check lists every `[TBC]` left on published pages.

---

## 7. Claude features

All three run **server-side** through one `lib/site/claude.ts` client using the Anthropic Messages API, the API key in a server env var (`ANTHROPIC_API_KEY`), and the **same model constant as Module 21 (Assist)** so the platform upgrades models in one place. Every call is grounded: the prompt carries only records from this brand's site (programs, locations, published pages, parent guide, Compete summaries), never other brands' data and never personal data. Each call is audit-logged (who, page, prompt, records used, tokens).

### 7.1 Write with Claude (block)
- An editor adds a **Write with Claude** block, writes what it should say, ticks which records to use (program, location, parent guide, Compete), and picks a length.
- Claude returns draft copy **in the ALL CAN voice** (short, present tense, every headline ends with a period, brand formats for dates and scores). The system prompt carries the rulebook's voice section and the copy formats from §1.
- Any fact not present in the chosen records comes back as `[TBC]`; the editor shows how many and which.
- **Use as text block** converts it into a normal text block tagged "Written with Claude · review". The tag clears on publish. Nothing generated is ever auto-published.
- **Improve with Claude** on any existing text block opens the same flow pre-filled with that block's content.

### 7.2 Build a page with Claude
- The editor describes a page. Claude returns a **structured proposal**: an ordered list of blocks, each with its type, its props, and why it's there, validated against the Module 23 block schema (`lib/site/blocks.ts`). Use structured output (JSON schema) so an invalid block type can't come back.
- The editor sees the proposal, can propose again, and **Create draft page** saves it as a draft with every text block tagged for review.

### 7.3 Ask ALL CAN (visitors)
- A sheet opened from the header, drawer, parent guide and home page. Suggested questions as chips, then a free-text box.
- Uses **Module 21's grounded-retrieval core**: retrieve from this site's published pages, program facts and policies only, answer with the sources it used as links, and say plainly when something isn't published. When unsure, it hands off to the contact route instead of guessing.
- Never collects personal data in the chat, never takes registrations or cancellations, never answers about another brand's programs.
- Rate-limited per visitor; questions without an answer are logged (no personal data) and surface on the dashboard as "questions families asked that the site doesn't answer".
- Can be switched off in site settings.

---

## 8. Build stages: show me each working

Stages 1–6 of Module 23 deliver the platform. On top of them:

1. **ALL CAN theme pack.** Tokens, header with mega menu and drawer, footer, grain, lane rule, pills, status pills, fact block, hairline rows, tables, portrait tiles. Conformance: every Module 23 block renders in this theme. Verify: the home page matches the prototype's structure on desktop and at 390px.
2. **Locations.** Location records, finder with request form, Toronto Midtown and Orangeville hubs, sport-at-location pages with program blocks and interest forms. Verify: changing a program's day in admin changes the public fact block.
3. **Compete on allcansport.ca.** Location-first filters, scores, standings, teams, team pages, players, profiles, follow a team with notifications. Verify: Toronto Midtown divisions appear here and on compete.athleteinstitute.ca with identical masking; following a team sends a test final-score notification.
4. **Supporting pages.** Sport overviews and coming-soon sports, Circuit, training with the request form, stories, parent guide, financial assistance with the confidential request, about and contact.
5. **Editor specifics.** Dashboard panels, the ALL CAN block types, navigation editor depth rule and live preview, settings including Ask ALL CAN and the `[TBC]` go-live check.
6. **Claude.** Write with Claude block, Improve with Claude, Build a page with Claude (structured proposal), Ask ALL CAN with sources and hand-off, audit log, rate limits.
7. **Launch.** Domain, Clerk satellite, status Coming soon, then Live once every launch fact is confirmed.

Registration and full program pages are a separate later stage, once the registration platform is ready.

### Tests
- Location → sport → program filtering, and no cross-brand leakage on any page.
- Fact block order and `[TBC]` rendering (editor vs live).
- Interest form validation and consent; nothing labelled as registration.
- Compete parity with compete.athleteinstitute.ca; masking; hidden players never get profiles.
- Nav depth rule; mega panel built from the tree; keyboard and Escape behaviour.
- One red per view: a render check that counts red-filled elements per page.
- Claude: proposals validate against the block schema; facts missing from records come back `[TBC]`; Ask ALL CAN answers cite sources and hands off when no source matches; generated content is never published without an editor action.

---

## 9. Open items to confirm before launch

- Toronto area name for De La Salle College (working name "Toronto Midtown"), parking and arrival details.
- Ages or birth years, days, times, season dates, prices, inclusions and capacity for every program.
- Circuit divisions, selection process and events.
- Coaches per location; screening statement wording.
- Refund, cancellation, weather, attendance and consent policies.
- Financial assistance funding, limits, reviewer and response time.
- Contact email, phone and response time; local social handles.
- Photography: first shoot, credits and guardian media permissions.
- Rulebook open items that touch the site: the ALL CAN League mark and sign-off, and whether the Nike partnership extends to ALL CAN.
