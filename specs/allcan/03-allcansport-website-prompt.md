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
| Display face | **Futura Bold** (regular width, not condensed) for the hero tagline "Sport that belongs to everyone." and the Play. / Compete. / Grow. pillar words in Why ALL CAN. Owner-approved exception to the rulebook's SF Pro-only web rule, for those lines only. Load it from the visitor's device (`local()`; Apple platforms ship it), fall back to Jost Bold from Google Fonts. To show Futura on every device, license a Futura webfont (for example Futura PT through Adobe Fonts) before hosting it. |
| Live / Tickets / Gear | **Link out only.** Shop goes to gear.athleteinstitute.ca. |
| Claude | Three features: **Write with Claude** block, **Build a page with Claude**, and **Ask ALL CAN** for visitors (answers only from published facts, hands off to staff). |
| Editor | Site dashboard, page builder with the Claude block, navigation and mega-menu editor, site settings. All from Module 23. |

---

## 1. Brand rules that shape the build

The rulebook (`design-system/guidelines/ALL-CAN-Design-System.md`) and tokens win every conflict. Web behaviour follows `design-system/guidelines/web/WEB-UIUX.md`, which applies the Athlete Institute UI/UX prompt with the ALL CAN translation table. The key rules for this site:

- **Colour.** Red `#CE112D` is the accent. **Owner decision:** red marks live and open status pills ("Open", "Now playing", "Following") and the main action in a section (for example Parent guide on the home page), so a view can carry more than one red moment; the rulebook's once-per-view rule is relaxed for the website. Keep red for those jobs only. Ink `#212322` for dark surfaces and type on light. **White `#FFFFFF` is the page ground** (owner decision; replaces the rulebook's Paper default). Paper `#EAEAEA` stays for small fills such as hover and selected states. Cool Gray 11 `#53565A` for secondary text on light. Red text only on light surfaces; on dark, red is a fill.
- **Header and footer on black.** The ALL CAN Sport shield and horizontal files exist only as `-on-black` and `-on-red` versions, and the rulebook says a logo file sits only on the background its filename names. So the header and footer are `#000000`. Everything else follows the surface rules.
- **Display lines.** The hero tagline and the pillar words use the display face from §0 (Futura Bold, weight 700). Nothing else on the site uses it.
- **Type.** Semibold (600) headlines with tight leading; at most four sizes per layout; tabular lining numerals everywhere; body lines no wider than about 60 characters. Every headline ends with a period ("Locations." "This week.").
- **Grid.** 12 columns, 1440 max, margins `clamp(20px, 4.4vw, 64px)`. Labels and stacked titles in the left half; content from column 7.
- **No cards, no shadows, no rounded corners** except pill buttons and status pills. Structure comes from 1px hairlines: standard at 28% Ink, strong at 70%. Tables have no vertical rules and no zebra stripes.
- **Motif and texture.** The lane rule (three 1px hairlines 8px apart) is the only motif. Ink surfaces carry a ~7% grain. No gradients except photo scrims, no patterns, no illustrations.
- **Glyphs.** Hamburger, close and chevron only, drawn from CSS hairlines. No icon set, no emoji.
- **Sport marks.** Each sport has a supplied line mark (basketball snowflake ball, volleyball maple leaf, soccer star shield, flag football field). Files: `design-system/logos/sports/`. Black on white, about 72px tall, above the sport name. They are logos, not icons: never recolour, outline or redraw them, and don't use them as UI glyphs.
- **Photography.** Full-bleed, one treatment per composition, faces never covered by type, every photo credited. Until real photos exist, use Ink with grain and a "Photo [TBC]" credit. Never use stock or another brand's images.
- **Copy formats.** Dates stacked: `Saturday / April 4th / 2026.` Times: `7:30pm ET`. Scores and records with an en dash: `84–79`, `12–3`. Inline meta with middle dots: `De La Salle College · Court 2 · 7:30pm ET`. Brand name always `ALL CAN` / `ALL CAN Sport`.
- **Accuracy.** Never state a date, price, age group, coach, partner or stat that wasn't supplied. Show `[TBC]` in admin and hide unconfirmed rows from the public page once the site is live (see §6.4).
- **Never** use All Canadian Games or Orangeville Prep marks, lines, colours (Trophy Gold), Inter, JetBrains Mono or the dot field.

Implement the brand as the Module 23 **theme pack** `packages/foundation/src/themes/all-can/` with renderers in `components/site/themes/all-can/`. Tokens come from `design-system/tokens/` minus the font files. Logos ship from the public `brand-assets` bucket under `sites/all-can/` (raster only), resized for web.

---

## 2. Site map and URLs

```
/                                   Home
/locations                          Finder: every location grouped by city, with status; request a location or host a program
/my-teams                           Signed in: teams you follow, their next games, recent results, notification settings
/[location]                         Location hub, e.g. /toronto-midtown, /orangeville
/[location]/[sport]                 Sport at a location, e.g. /toronto-midtown/basketball
/[location]/[sport]/[program]       Program page (later, with registration), e.g. /toronto-midtown/basketball/league
/[sport]                            Sport overview, e.g. /basketball, /volleyball (coming soon)
/circuit                            ALL CAN Circuit (rep)
/schedule                           Compete: upcoming games
/results                            Compete: final scores, newest first
/scores                             Compete: schedule and results together (kept for links from Compete)
/standings, /standings/[division]   Compete: standings
/rosters                            Compete: Rosters, with a Teams / Players switch
/teams/[team], /players/[player]    Compete: team pages and player profiles (/teams and /players redirect to /rosters)
/training                           Skills sessions + private instruction
/stories, /stories/[slug]           Newsroom
/parent-guide                       How it works, placement, what to bring, policies
/financial-assistance               Policy, limits, outside programs, confidential request
/about                              About ALL CAN Sport, operator, contact
```

Location slugs are unique site-wide. Toronto areas are separate locations with a shared `city = "Toronto"` used for grouping in the finder and the Locations mega menu. Add a `locations` concept to `brand_sites` content (or reuse Module 2's facility tree with a `public_location` record) holding: slug, name, city, venue, address, parking, arrival, contact, local social link, status (`open`, `opening_soon`, `waitlist`, `closed`), and the sports offered. Programs link to a location through their venue. Status pills show a launch date when one is set (for example Toronto Midtown: **Coming Jan 2027**) instead of a generic "Opening soon"; the label comes from the location's status plus an optional launch month.

---

## 3. Navigation

Desktop header, left to right: **shield** (links home) · **Play ▾ · Locations ▾ · Compete ▾ · Families ▾** · Sign in · **Ask ALL CAN** (outline pill).

**Signed in (desktop):** a round white chip with the person's initials replaces the Sign in link, in the same place, left of Ask ALL CAN. Clicking it opens a white dropdown under the header: name and email, then **My teams and schedule** (`/my-teams`), **My account on Play** (play.athleteinstitute.ca/account), **Site editor** (only for people with a Site Editor or admin role on this site), and **Sign out**. Escape or a click outside closes it.

| Root | Type | Mega menu columns |
|---|---|---|
| Play | folder | Title "Play." takes a narrow column (2 of 12) so the tabs and panel start right beside it (columns 3–9). **Sport tabs** across the top (Basketball, Volleyball, Soccer, Flag Football), each a pill with its sport mark; the selected tab is filled Ink with the mark inverted. Clicking a tab (or arrow keys, as a proper ARIA tablist) shows that sport's panel below: its programs as hairline rows with a one-line description (Basketball: League, Skills, Circuit) and an "All of basketball" link; coming-soon sports list their programs marked Soon and a "Request [sport] near you" link. Featured: Basketball. |
| Locations | folder | **Location cards** on the left under the panel title "Locations.": one card per location (two today), each with a venue photo (4:3), location name, facility and status pill (no separate city label), linking to the location hub; cards come from the location records, not the menu tree. To the right of the cards, in the same row and starting level with the top of the photos, two plain links with no heading: Request a location, Host a program (All locations is hidden for now; the /locations page stays live). No featured box in this dropdown. |
| Compete | folder | No column headings: **Schedules & Results** (`/scores`), **Standings**, **Rosters**. Featured: Schedules & results. (Any dropdown made only of pages shows no column heading.) |
| Training | page | Hidden from the header for now. The page stays live, linked from Sports → Basketball → Skills. |
| Stories | page | Hidden from the header for now. The page stays live, linked from the footer. |
| Families | folder | For now: **About ALL CAN Sport** and **Contact** only. Hidden menu items, kept in the tree to turn back on later: Parent guide, Financial assistance, Rowan's Law (concussion safety, https://www.ontario.ca/page/rowans-law-concussion-safety), Safe Sport (https://abuse-free-sport.ca). The pages stay published. Featured: About. |
| Shop | link | gear.athleteinstitute.ca, new tab. Hidden from the header for now; the footer keeps its Shop link. |

The menu is the Module 23 `site_nav_items` tree: root → folder → folder → page/link at most. In the mega panel the title is just the menu name with a period (no kicker, no description line), set in Futura Bold in red; the Play title's period is the dribbling ball from Why ALL CAN; a root folder's child folders become columns; loose pages form a "More" column; a featured slot shows one promo with its line. Opens on hover with a pointer and on click or Enter for keyboard; Escape closes; focus returns to the trigger.

Phones: black bar with Menu (hamburger + word) on the left and the shield centred. Menu opens the white left drawer. At the top, two side-by-side buttons: **Ask ALL CAN** (filled Ink) and **Sign in** (outline). When signed in, the Sign in button becomes a profile button (initials and first name); tapping it opens the same account links as the desktop dropdown in place, under the two buttons. The phone header never shows a profile icon; it stays Menu and logo only. Below them, root items as large rows and folders as accordions with their columns as subheads. In the phone menu, **Locations** opens to a single **Ontario** heading with every location under it (Toronto Midtown, Orangeville), then a hairline and the Request a location and Host a program links.

Footer (black): ALL CAN Sport horizontal logo (max width 336px) and "A division of Athlete Institute." on the left; two columns on the right. **ALL CAN Sport:** Locations, Host a program, Schedules and results, Standings. **Families:** About, Contact. Then **Athlete Institute:** Watch, Tickets, Shop link-outs. (Basketball, ALL CAN Circuit, Rosters, Stories, Parent guide, Financial assistance, Policies, Rowan's Law and Safe Sport are left out of the footer for now.) legal line in micro caps with the photo credit.

---

## 4. Pages

### 4.1 Home
1. **Hero** (on desktop it fills the screen below the header, at least 640px tall; on phones about 80% of the screen. Full-bleed photo: `design-system/photos/home-hero-allcan-basketball.jpg`, ALL CAN Basketball youth game, anchored to the top so faces stay clear; the supplied edit already darkens the background behind the featured players; the site adds only a light grade and a bottom scrim so white type reads; Ink with grain only if the photo fails to load). The supplied file is 1278px wide; `-web-2x.jpg` is a 2× cleaned-up version (light de-noise and sharpen) used in the prototype. Replace both with a 2400px+ original before launch, and confirm guardian media permission for every player shown. No kicker and no lane rule. In place of a text headline, the **red ALL CAN wordmark** (`allcan-horizontal-red`, from the alternate set, recoloured to the button red `#CE112D` at the owner's request, used here at the owner's request; sized from the same scale as the tagline, so the two stay in proportion at every width). Its filename says it belongs on white; on the hero it sits on the darkened photo by owner decision, then the H1 **"Sport that belongs to everyone."** in Futura Bold, always on exactly two lines: "Sport that belongs" / "to everyone.". Shared scale for the wordmark and tagline: `--hs = min((100vw − 48px) ÷ 10.8, max(4.8vw, 34px), 81px)`; wordmark = `10.6 × --hs`, tagline = `0.9 × --hs`, gap = `0.4 × --hs` (at 1440: wordmark 733px, tagline 62px; at 390: 336px and 29px). One red pill **Find your location** → `/locations`, bottom right. Vertical photo credit on the right edge. "Play. Compete. Grow." now lives in Why ALL CAN, not the hero.
2. **Why ALL CAN** (white, directly after the hero): section label "Why ALL CAN". No "Our mission" label. Left: the mission, tightened, at H2 size: "Inclusive, professional sport for all ages and abilities, where everyone can belong, grow and reach their potential." Then a semibold sub-line: "Youth and adult leagues, plus skills programs, in basketball, volleyball, soccer and flag football." Right: three hairline rows, each one line in the display face (tracking -30, i.e. letter-spacing -0.03em): **Play. For life.** · **Compete. Together.** · **Grow. Every day.** The pillar word is red; the phrase after it is secondary, brand Silver `#9FA1A2` (owner decision; it measures 2.6:1 on white, below the 3:1 large-text guideline, so keep these phrases decorative and never the only place information appears), at 60% of the pillar word's size. No program line under the rows. The period of **Play.** is a red ball with the Play Portal's dribble (`pw-dribble` in the portal's `app/globals.css`, same keyframes and 1.8s loop; off under reduced motion). Add a vision line once one is approved. Below the mission and pillars, still inside Why ALL CAN (no separate Sports section), a strong hairline and the full program overview: four sport tiles, each with its sport mark, a status pill ("Now playing" or "Coming soon"), the sport name and every planned program. Basketball (links to `/basketball`): Youth league · Youth skills · Rep circuit. Volleyball and Soccer: League · Skills. Flag Football: League. The programs of coming-soon sports are shown muted, followed by a **Request** link that opens the Request a location form with that sport selected (`/locations?sport=<sport>#request`). Four columns on desktop, two on phones.
2b. **Partners** (black band, directly under Why ALL CAN): section label "Partners", then four logos in a row (two per row on phones), each sized to the same visual area rather than the same height (height = k ÷ √aspect ratio; k about 116px desktop, 84px phones), so the round and wide logos read as equal; Athlete Institute sits a touch smaller (about 85% of its equal-area size): All Canadian Games, Athlete Institute, NCCP (National Coaching Certification Program), Safe Sport Training. Files in `design-system/logos/partners/`. Owner decision: the All Canadian Games roundel appears here although the rulebook keeps ACG marks off ALL CAN layouts; confirm partner logo permissions before launch.
3. **Locations**: no heading or intro line, just the section label (no "All locations" link). Full-width hairline rows, one per location: name, venue (no street address on the home page; the address lives on the Locations finder and the location page), status pill, chevron. Last row: "Your area" → request a location.
4. **Schedules, results and standings**: two large Ink pill buttons side by side (stacked on phones): **Schedules & Results** → `/scores` (upcoming games and finals together) and **Standings** → `/standings`. No game list on the home page for now.

### 4.2 Locations finder
Grouped by city, then location rows with venue, address, sports and status. Then one section, **Request a location · Host a program** ("Bring ALL CAN to your area."):
- **Left:** a short line for each audience, then **Hosting a program** as a fact block: what the host provides (gym time, a suitable court), what ALL CAN provides (coaching, program plan, registration, scheduling), sports, insurance, rental or revenue terms, and the next step (a call and a site visit). Terms are `[TBC]` until confirmed.
- **Right:** one form with a choice at the top: **Request ALL CAN near me** (families and players) or **Host a program** (schools, community centres, facilities). Shared fields: area or city, sport (or "More than one"), name, email, consent. Host adds organization, role, facility type, facility address, courts or fields available, when the space is available, and an optional phone. The consent line and submit label change with the choice ("Send request" / "Send hosting enquiry").
- `/locations#host` (and the menu's Host a program link) opens the section with Host selected.
- Requests feed a `notify()` list and the dashboard. Hosting enquiries also go to the operations contact as a lead with the facility details.

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
Structure (four sports and their leagues), operator ("A division of Athlete Institute"; use the legal name, e.g. "Athlete Institute Ltd.", only once confirmed; Orangeville Prep and the All Canadian Games keep their own sites), and **Contact** (email, phone, response time; registration and cancellations always through this contact, never social messages).

---

## 5. Compete inside the site

Everything here reuses Module 23 §3.2: shared Compete components, `brandKey` filters in `lib/compete`, name masking and `show_on_compete` untouched, Compete's own site stays the cross-brand index with canonical links pointing here.

- **Filters everywhere: location first, then division.** Add a `locationSlug` filter to `listDivisions`, `upcomingGames` and the standings query (division → program → venue → location).
- **Schedules** (`/schedule`) and **Results** (`/results`): the same layout, filtered to upcoming games (soonest first) or finals (newest first), with an empty state per division. `/scores` shows both.
- **Game lists**: grouped by date heading in the brand date format, venue under the heading, then game rows: time and court · home team, score or "vs", away team (winner in semibold) · status pill (Final, Upcoming, Postponed). Team names link to team pages.
- **Standings** (`/standings`): division tabs as pills; table with #, Team, GP, W, L, PF, PA, Diff, Streak; tie-break note under the table.
- **Rosters** (`/rosters`): one page with a **Teams / Players** switch. Teams view and Players view are described below; links to the Players view open it directly.
- **Teams view**: location and division filters; hairline rows with name, location, record, coach. **Team page**: record in the lede, **Follow this team**, roster grid, schedule and results.
- **Players view**: search by display name, filters for division and team; portrait grid (panel-coloured 4:5 tiles, initials when there's no consented portrait, jersey number top right). Only players with guardian permission appear; masked players show as "Team member" on rosters and never get a profile.
- **Player profile**: portrait, number, team, division, location, a short player-approved introduction; stats only where the division records them (`statsEnabled`).
- **My teams** (`/my-teams`, signed in): followed teams as rows, their next games and recent results, and notification settings with a link to change channels on Play. Signed out, it asks the visitor to sign in.
- **Follow this team**: signed-out visitors are asked to sign in first. Signed-in families (Clerk satellite on allcansport.ca) follow a team; schedule changes, postponements and final scores go out through `notify()` using the family's channel preferences. Store follows in a new `team_follows (profile_id, team_id)` table.
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
