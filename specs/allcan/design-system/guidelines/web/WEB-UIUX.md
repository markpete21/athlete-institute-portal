# ALL CAN — Web UI/UX layer

**Required for every web page, web app or product screen.** Read this file, then `AI-UIUX-Prompt.md` (the Athlete Institute UI/UX prompt, verbatim).

## Precedence

1. ALL CAN rulebook (`guidelines/ALL-CAN-Design-System.md`) and `tokens/` — brand elements. Always win.
2. `AI-UIUX-Prompt.md` — behaviour, component anatomy, states, copy patterns, accessibility.

The prompt's own §0 says existing brand notes win. Its colours, fonts, textures and radii describe the Orangeville Prep "Vanguard" skin, which ALL CAN bans. Use its **structure and behaviour**; translate its **look** with the table below.

## Translation table

| Prompt says | ALL CAN uses |
|---|---|
| Trophy Gold `#9E8959` accent, gold buttons, gold links, gold focus | Red `#CE112D`, once per view. Red text only on light surfaces; on dark, red is a fill. Secondary emphasis is Ink. |
| Per-event / per-brand accent override | Not used. ALL CAN skins swap logo and sign-off only. |
| Ink `#1E1E1E` | Ink `#212322` |
| Silver `#9EA1A1`, deepens to `#5F5F5F` on paper | Silver `#9FA1A2` on dark; Graphite `#53565A` for secondary text on light |
| Paper `#FAFAF8`, panels `#F5F2EA`, cards white | Paper `#EAEAEA` and white per `tokens/web.css` |
| Pure black `#000` dark islands | Ink `#212322` with grain |
| Dot field texture | Banned. Lane rules (three hairlines) are the only motif. |
| Inter display/body | SF Pro Display (Semibold 590 headlines) per rulebook §4.2 |
| JetBrains Mono labels and numbers | Banned. Labels: SF Pro Medium, uppercase, tracked. Numbers: tabular numerals. |
| Radii 16 / 12 / 9px | Hard corners (0) on cards, inputs, dialogs, tables. Pills (buttons, status) fully round. |
| `shadow-card`, hover shadow lift | No shadows. Hairlines only. Hover changes colour or underline. |
| Animated wordmarks ("Live.", "Tickets.", "Gear.", "Home.") | Not ALL CAN marks. Never use. Use the ALL CAN logo files as supplied. |
| ✓ ✕ ? ! glyphs, line icons in `<details>` | Web glyph set is hamburger, close, chevron (rulebook). Status uses words + colour; validation ticks use text "Done." / "Needed." [TBC with brand owner if glyphs are required]. |
| Taglines, product names, support emails, Stripe/HST copy | Product-specific to Athlete Institute apps. Use only when the ALL CAN screen is that product. Never invent. |

## Use as written

- §4 Layout behaviour: reading widths, card grids, two-column detail with sticky panel, no sideways scroll, mobile sheet, 40×40 / 44px targets (container is ALL CAN 12-col, 1440 max).
- §5 Component anatomy and states: button hierarchy (primary / ghost / destructive), loading labels ("Saving…"), card order, price formats, status vocabulary, forms, tables, dialogs, sheets, drawers, toasts, banners, nav patterns.
- §6 Motion: 150ms colour/opacity only; honour `prefers-reduced-motion`. ALL CAN tokens set easing and durations.
- §7 Copy: literal verbs, reassurance lines, empty states that point to the next action, never a dead end, en-CA dates and America/Toronto, "Date TBA". Headlines follow ALL CAN voice and end with a period.
- §10 Interaction principles 1–14: all apply.
- §11 Accessibility: all apply. Focus ring is Ink on light, white on dark.

## Checklist (web)

- [ ] Rulebook §13 QA passes.
- [ ] Red appears once per view.
- [ ] No gold, Inter, mono, dot field, shadow or rounded card.
- [ ] Empty, loading (skeleton), error and offline states designed.
- [ ] Forms: labels above, inline errors at the field, steps for 4+ fields, masks shown.
- [ ] Every dialog closes on Escape, backdrop and a close control.
- [ ] Targets ≥ 40px; no sideways scroll.
