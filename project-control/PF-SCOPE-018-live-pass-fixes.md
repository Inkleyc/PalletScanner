# PF-SCOPE-018 — Web live-pass fixes: Inventory cards, compact Orders toggle, Deep separation, dialog structure, Edit form facelift
Status: IN_PROGRESS
Owner approval: APPROVED 2026-11-09 (owner, from his live pass on main after the PF-SCOPE-017 merge: five findings, "build all 5")
Decision authority: PF-D-016 (slate design direction); layout/visual changes only, no behavior or data changes. No protected operations.

## Problem (owner live pass on main, 2026-11-09 evening, real cloud data)

1. Inventory table rows "get lost in the background" (both themes) — the owner asked for a card system for inventory items.
2. The Orders/Returns section toggle is far too big — it reuses `.saved-views`, a 6-column grid strip built for filter buttons; with two buttons they balloon into a giant filled slab.
3. Section/panel lines in Deep are too faint to separate content (root cause found during the build: Deep's `--app-border` was implemented as a color-mix rendering ≈ #232f47, even darker than the pinned slate token #374763).
4. The item detail dialog is one flat slab — photo column, detail grid, tabs, and header blend together.
5. The Edit item form needs a facelift: ragged grid, Condition field truncated ("Details need re…"), Item weight misaligned with the price row, Approved listing price cell ragged with wrapping helper text, no grouping.

Unifying theme: Deep separation/contrast is underpowered.

## Included (apps/web only — App.jsx + styles.css)

- Deep line tokens raised one step: `--app-border` → #4a5f83 (set outright, replacing the too-dark color-mix), `--app-border-strong` → #687fa3. Day unchanged.
- Orders/Returns toggle scoped via a modifier class on that instance only: fit-content width, compact segmented buttons; the other two `.saved-views` usages (orders queue filter, Review) untouched.
- Inventory table replaced with a responsive card grid: same data per card (photo, name, status badge, pallet, platform, mono qty/age/price footer), bulk-select checkboxes preserved (select-all moved to the toolbar), card click opens the same detail dialog, sort (name/pallet/qty/age, asc/desc — the table's existing dimensions) moved to a toolbar select driving the same state/comparator.
- Item detail dialog structure: header separated by a hairline, photo column as an inset panel, detail-grid cells as tiles.
- Edit item form regrouped into Item / Pricing / Listing sections on one aligned grid with consistent field heights; Condition gets a wide cell; the Approved listing price helper text sits under its field. Same fields, handlers, validation, and footer.

## Explicitly excluded

- No behavior, data-flow, or copy changes (beyond the three form group headings and the Sort label). Orders/Analysis tables untouched. Mobile untouched (phone findings are PF-SCOPE-019).

## Acceptance checks

- [x] Root `npm run check` green (verified on current main + this change).
- [x] Screenshots (Day + Deep) of Inventory cards, Orders toggle, Settings lines, detail dialog, Edit form — reviewed by Lenard before the PR. Two screenshot-found defects fixed in this same scope: the Inventory toolbar clipped its Select-all control at narrower widths (now wraps), and the Edit form's Floor price input stretched to its row height (now uniform). The Analysis uncategorized notice also rendered as an off-palette brown bar in Deep (from the owner's screenshots); it now uses a slate background with an amber edge.
- [ ] Owner live check on the PR preview/main after merge: cards read clearly, toggle is compact, Deep panels separate, dialogs feel structured.

## Completion record

Built 2026-11-09 on scope/PF-SCOPE-018-live-pass-fixes (based on main @ 345659bb, after PR #14). Root check green; screenshot pass by Lenard (local sample data) across all five surfaces plus the Analysis notice. Remaining: owner live check after merge, then VERIFIED/CLOSED.
