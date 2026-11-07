# PF-SCOPE-013 — Mobile item editor: keyboard can be dismissed and no longer traps the form
Status: IN_PROGRESS
Owner approval: APPROVED 2026-11-07 (owner, after hitting the trap for the second time in one day: "Fix the other issue")
Decision authority: PF-D-003 (correct bugs and improve reliability within an approved scope); no protected operations.

## Problem (owner-reported twice on 2026-11-07)

Numeric pads on iOS have no return/dismiss key. The login screen trapped the owner behind the number pad in the morning (fixed in PF-SCOPE-002/PR #4 with KeyboardAvoidingView + tap-to-dismiss). The Inventory item detail sheet (`apps/mobile/app/(tabs)/explore.tsx`) has the same trap, worse: sixteen text inputs (quantity on the number pad; low/high/floor/listing price on decimal pads) in a modal sheet with **no keyboard handling at all** — the keyboard covers the "Save changes" button, tapping the card background does nothing (`onPress={() => undefined}`), and scrolling does not dismiss. The owner hit it while editing an item's approved listing price on 2026-11-07 16:26 MST and could not get rid of the keyboard.

## Included (explore.tsx only)

- The item detail sheet's card is wrapped in a `KeyboardAvoidingView` (same behavior props as the login fix: `padding` on iOS, `height` otherwise), so the sheet lifts and the focused field plus Save changes stay reachable above the keyboard.
- The card's background tap now dismisses the keyboard (`onPress={Keyboard.dismiss}`, replacing the no-op swallow). Tapping the backdrop still closes the sheet, unchanged.
- The sheet's ScrollView gets `keyboardDismissMode="on-drag"` (any scroll drag dismisses the keyboard) and `keyboardShouldPersistTaps="handled"` (buttons such as Save changes / Post respond on the first tap while the keyboard is up; taps nothing handles dismiss it).
- The Inventory tab's main ScrollView gets the same two props, covering the inline sold-price editor (decimal pad) in the item list.

## Explicitly excluded

- No layout, styling, or behavior changes beyond keyboard handling; no other screens (capture and scan-barcode already handle the keyboard; the login fix shipped in PF-SCOPE-002). The filter/bundle modals in the same file have no numeric pads and are untouched.
- No interaction with PF-SCOPE-009's planned move-only split of this file (not yet started; it will move this code as-is).

## Acceptance checks

- [ ] Mobile typecheck and lint clean; CI green on the branch.
- [ ] Owner, on device (branch checked out, Metro running): open an item in Inventory, tap a price field, then (a) drag the form — keyboard dismisses; (b) tap the card background/header — keyboard dismisses; (c) with the keyboard up, the listing-price field and Save changes are reachable (sheet lifts), and Save changes responds on the first tap.

## Completion record

(Pending — filled in at verification.)
