# PF-SCOPE-017 — Slate design port, web + mobile (experiment)

Status: OWNER_REVIEW — experiment built on `experiment/design-slate-port`; owner approved shipping 2026-11-08 ("Ship it — open the PR to main"); PR opened, merge on the owner's go-ahead
Owner approval: APPROVED to build 2026-11-08 ("Let's start with the three things you said. Do them."; phone recommendations folded in the same day: "Wrap it all into one build and execute."). Merging to main is a SEPARATE owner decision.
Decision authority: PF-D-016 (design direction); PF-D-004 (material redesign needs owner approval — the experiment evaluates, it does not ship); repo experimental-freedom rules (isolated branch, documented, never merged without explicit approval).

## Problem

Both apps wear the generic template look: light-only, white cards with soft shadows, navy primary `#234a6b`, rounded radii — "classic AI." The owner likes the Slate design system developed for Merit and directed it be evaluated for PalletFlip, with three additions proposed by Lenard and approved: (1) one unified line-icon language (the web app had no icon system at all — text-only buttons), (2) a badge color language (the old `warning` amber did double duty for routine owner-decisions and genuine problems), (3) spacing tokens in the shared layout layer.

## Decision (PF-D-016)

Slate on both apps: Day + Deep tokens with a toggle, warehouse amber accent, flat + hairline, mono data. Phone expression: Deep default, chunkier targets, camera surfaces always dark. Warm/brown neutrals rejected.

## Included

### Web (`apps/web`)
- Slate tokens on the existing `--app-*` CSS variables: Day on `:root`, Deep under `[data-theme="deep"]`; radii 10px cards / 7px controls; shadows removed except modal/dropdown/toast; header theme toggle (sun/moon) persisted to `localStorage["palletflip-theme"]`, default Day.
- Spacing scale `--space-1..6` + row-padding tokens applied to the shared layout classes.
- Badge language: neutral = information, amber `decision` = waiting on the owner, green = success/ready, red = danger. Every former `warning`/`primary` call site reclassified by meaning (shipment exception, stock shortage, tracking exception, identity mismatch → danger; review/suggestion/setup states → decision; deliberate states like "Outbound paused" → neutral).
- New `src/icons.jsx`: stroke icon set (grid, box, clipboard-check, layers, tag, gear, plus, search, camera, chevron-right, alert-triangle, sun, moon, archive, x) wired into the main nav, theme toggle, and "Take photo" buttons.
- `.num` mono-data utility on metric values, price/quantity table cells, detail-grid numbers, and price inputs.

### Mobile (`apps/mobile`)
- `constants/app-palette.ts` restructured into `DayPalette` / `DeepPalette` with identical token names; all tab screens + shared components converted from the static palette to palette-parameterized style factories via new `lib/app-theme.tsx` (`AppThemeProvider`, `useAppPalette`, `useAppTheme`); mode persisted as `themeMode` in `lib/app-settings.ts`, **default Deep**; React Navigation theme and StatusBar follow the palette; the app no longer follows the OS scheme.
- Settings gains a Theme card (Deep/Day switch) mirroring the eBay-reminder card.
- Chunkier targets: tab bar taller with an amber active pill (amber = active tint), dashboard primary button and item-sheet buttons/inputs raised to 48pt minimums.
- Camera surfaces pinned to Deep in both modes: Scan tab, `capture.tsx`, `scan-barcode.tsx`. On the Scan tab, three white-alpha copy literals on the amber card became dark alphas to stay readable on bright amber.
- Mono data via shared `AppTextStyles.num` on dashboard metrics and explore prices/quantities (rows, badges, item-sheet inputs).

## Explicitly excluded

- No behavior, data, navigation, or copy changes — visuals only. No repository/model/service files touched on web; no sync/data logic touched on mobile.
- Login, onboarding, and the root redirect screens keep the legacy light palette for this experiment (known seam: the app now defaults to Deep, so login still renders light — polish item for the shipping decision).
- Expo template components (`themed-text`, `themed-view`, `theme.ts`) untouched — unused by app screens.
- Web theme flash: theme applies in an effect after first paint, so a hard reload in Deep can flash Day briefly; fixing it needs a blocking inline script in `index.html` (deferred to the shipping pass).

## Verification

- Web: root `npm run check` green (tests, contract checks, Vite build, both package typechecks).
- Mobile: `npm run typecheck` clean; `npm run lint` 0 errors, 1 pre-existing warning (`lib/barcode-lookup.ts`).
- Visual evidence: Lenard-served Day/Deep screenshot pairs for the web build (Dashboard, Inventory, Review, item editor) versus main, presented to the owner with this branch. Mobile visual evaluation is the owner's on-device pass (no device available to Lenard).
