# PF-SCOPE-027 — Design graduation: the form design becomes the standing design

Status: VERIFIED 2026-11-21 (mobile PR #35 merged as b997bbd9; web merged to main db2c87b, root check green, Work Order theme verified live in production CSS; trailing owner step: one post-merge EAS Update from main).
device-verified on their experiment branches — merges to `main` are
this scope's remaining work)
Owner approval: 2026-11-21 ("set that in concrete now"), given after
the owner found the production web app still wearing the old design:
the proven design existed only on experiment branches, and graduation
is the step that makes it the app's standing design.

## Problem

The form design was trialled, workshopped, and verified on device
during 2026-11-20/21, but it lived entirely on experiment branches:

- Mobile: `experiment/work-order-mobile` (head `1bbdc29` at
  graduation, which also carries PF-SCOPE-026 via a merge of `main`).
- Web: `experiment/work-order-machined`, open as DRAFT PR #33.

`main` — and therefore the production web app at
palletflip.pages.dev — still ships the PF-D-016 slate design alone.
An experiment that is never graduated is a design the product does
not actually have; this scope lands both halves and records the
decision (PF-D-019) that makes the form system the standing design,
superseding PF-D-016.

## What graduates

### Mobile — `experiment/work-order-mobile` → `main`

- One design master: `apps/mobile/constants/app-palette.ts` (Day and
  Deep slate palettes) + `apps/mobile/constants/app-shape.ts`
  (`FormShape`: card radius 6, chip radius 4, card border width 1.5),
  consumed by every screen only through the theme context in
  `apps/mobile/lib/app-theme.tsx` (`useAppTheme` / `useAppPalette` /
  `useAppShape`).
- An ESLint `no-restricted-imports` guard (in the mobile lint, which
  runs inside the root check) bans direct palette imports outside
  the master files, so a future screen cannot freelance its design.
  The guard was verified in both directions during the consolidation
  pass: the finished tree lints clean, and a planted direct import
  fails with the guard's message.
- Exactly two themes: Day and Deep, both over the same FormShape
  structure — Deep is Day's dark mirror, not a separate soft design.
  The trialled third option (the Work Order paper palette on mobile)
  is removed; a stored `workorder` setting degrades to Deep through
  the existing unknown-value fallthrough.
- The Expo-template theming system (themed text/view, OS-scheme
  hooks, template constants) is deleted; login, onboarding, the
  entry screen, and the modal follow the selected theme like every
  other screen. The scan flow (Scan tab, scan-barcode, capture) and
  the shared surfaces (AppAlert dialog, loading and photo-reference
  cards) carry the same form treatment — squared cards and chips,
  1.5px ink borders, mono micro-labels.

### Web — DRAFT PR #33 (`experiment/work-order-machined`) → `main`

- A third theme, "Work Order" (paper), joins the web theme cycle:
  Day → Work Order → Deep. Day and Deep are untouched.
- The Work Order theme is one scoped section of the single
  `apps/web/src/styles.css` token system: paper/ink tokens, hardware
  orange reserved for actions and attention, form-box panels, stamp
  badges in the established variant colours, mono uppercase table
  headers. The workshopped treatment applies (pale-steel rail, soft
  shadows, no plate pieces — screws/knurls/rivets were rejected by
  the owner outright and none exist), including the spacing pass
  that makes view stacks hug the top instead of stretching into the
  viewport.

### Decision

- PF-D-019 recorded in `project-control/DECISIONS.md`: the form
  design system is the standing design on both apps, superseding
  PF-D-016.

## Evidence (owner device verification, 2026-11-20/21)

All passes ran the experiment builds on the owner's iPhone via EAS
Update (preview branch) and were judged from the owner's own
screenshots:

- Web Work Order, workshopped per the owner's direction ("stick with
  that theme but adjust it to be a bit more professional… no plate
  pieces"): verdict 2026-11-20 — "That feels really good." A spacing
  pass followed (measured header voids cut from ~135px to ~25px on
  Overview) and shipped as preview deploys of PR #33's branch.
- Mobile palette pass (Work Order colours on the phone): Inventory
  wore it well, but the owner found it "kinda similar" overall — the
  phone had borrowed colours, not the structure.
- Mobile structural pass + the owner's verdict (2026-11-20, 22:57):
  "the current coloring in the day option with the changes you just
  made to the work order option would be right on" — Day slate
  colours + form structure is the winning phone combination; the
  follow-up flip made Day form-structured and left Deep and Work
  Order provably unchanged at that step.
- Consolidation live (owner screenshot 2026-11-20, 23:23): Settings
  shows the two-option Day/Deep selector with the copy "Both use the
  same squared form structure" — the two-mode end state running on
  device.
- Combined build `1bbdc29` (design + PF-SCOPE-026), published by the
  owner as EAS Update group `3ad09d9c` (2026-11-21, 07:01) and
  verified on device 2026-11-21, 07:16: the scan flow wears the form
  design (squared ACTIVE PALLET card with ink border, squared dialog
  and buttons, mono PRICE RANGE / FLOOR / QTY fields), and a cold
  barcode scan with the backend idle named the product — "Found
  Apple AirPods 4 Wireless Earbuds from the barcode" — the same
  build proving the design and the lookup fallback together. (The
  owner's first 07:13 screenshot was still the previous bundle —
  the rounded alert sheet was the tell; the update applied after
  two more launch cycles.)

## Out of scope

- Any further restyle or design change. Graduation lands the design
  exactly as proven; new design ideas are new experiments.
- The web fork question beyond what PF-D-019 records: the web keeps
  its paper Work Order theme, the phone deliberately does not — the
  apps land on different answers on purpose, each device-verified.
- PF-SCOPE-024/025 and everything else sequenced behind
  PF-SCOPE-004; unaffected.

## Acceptance

- The mobile experiment branch is merged to `main` with CI green.
- PR #33 (web) is merged to `main` with CI green, and the Work Order
  theme is live on https://palletflip.pages.dev (theme toggle cycles
  Day → Work Order → Deep) after the production deploy.
- PF-D-019 is recorded in DECISIONS.md and this scope's register row
  reflects the merges.
- A post-merge EAS Update from `main` puts the standing design on
  the owner's phone through the normal channel (no experiment
  branch involved).

## Verification

- At graduation, both branches are check-green: root `npm run check`
  exit 0 on `experiment/work-order-mobile` at `1bbdc29` (the merged
  design + PF-SCOPE-026 tree, re-verified after the merge of
  `main`), and PR #33's checks green on its branch, including the
  Cloudflare Pages preview deploys the owner reviewed.
- Device evidence: see Evidence above — every claim there is an
  owner screenshot or an owner verdict on the running build, not a
  local render.
- Remaining at scope open: the two merges and the production-web
  confirmation in Acceptance, which close this scope.
