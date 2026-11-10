# PF-SCOPE-019 — Mobile switches: one treatment, visible in both themes
Status: IN_PROGRESS
Owner approval: APPROVED 2026-11-09 (owner finding during the PF-SCOPE-017 phone pass; after the PR #14/#15 pull he reported "Phone app toggles still disappear in light mode" — build go-ahead for this surveyed fix)
Decision authority: PF-D-016 (slate design direction). Visual-only; no behavior changes. No protected operations.

## Problem (owner, 2026-11-09, Settings in Day + Deep)

- Day: OFF switches nearly disappear; the ON switch pairs a leftover light-blue track (`#a9c8df`, missed by the PF-SCOPE-017 port) with a muddy dark-amber thumb — "the colors are different."
- Deep: reads fine — do not break it.

Root cause: iOS does not tint a Switch's OFF track (trackColor.false is ignored; the system off appearance is pale gray in light mode, dark in dark mode). OFF was a near-white `#f4f4f4` thumb on that pale track over a white card — a ghost. ON used the legacy `#a9c8df` track with a `primaryStrong` thumb (brownish in Day).

## Included (apps/mobile/app/(tabs)/settings.tsx only — the app's only three Switches)

One treatment for Theme, Posting After Save, and eBay Details Reminder:
- Track ON: `palette.primary` (amber — Day #c77400 / Deep #f0a832); the hard-coded `#a9c8df` is gone. Track OFF stays `palette.borderStrong` (Android/future; inert on iOS).
- Thumb ON: white `#ffffff` in both themes.
- Thumb OFF: Day → `palette.textMuted` (slate, clearly visible against the pale iOS off-track and white cards); Deep → `#f4f4f4` (unchanged — Deep already reads correctly).

## Explicitly excluded

- No other screens (no other Switch components exist in the app — verified by survey 2026-11-09). No settings behavior changes.

## Acceptance checks

- [x] Mobile typecheck clean; lint 0 errors (1 known pre-existing warning in untouched barcode-lookup.ts).
- [ ] CI green on the PR.
- [ ] Owner device check: Settings in Day — OFF switches clearly visible, ON switches amber with a white thumb; Deep unchanged-good.

## Completion record

(Pending — filled in at verification.)
