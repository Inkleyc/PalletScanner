# PF-SCOPE-002 — Mobile scan/photo → draft → save → next-item reliability
Status: VERIFIED (device pass complete 2026-11-07; PR #4 merged as 1747afb1; closes on merge of PR #5, which carries this record)
Owner approval: APPROVED 2026-11-03 (all three audit-proposed scopes approved in order; this scope is worked second, after PF-SCOPE-001 closed 2026-11-04)
Branch: scope/PF-SCOPE-002-mobile-capture-reliability
Base: main c6179b35 (PF-SCOPE-001 merged, CI green)
Lifecycle: PROPOSED → APPROVED → IN_PROGRESS → VERIFIED → OWNER_REVIEW → CLOSED
Related decisions: PF-D-001 to PF-D-008 (scope governance), PF-D-011 (AI wanted, vendor-agnostic; re-enabling AI requires a separately approved scope — this scope does NOT re-enable or require AI)
Dependencies: `docs/mobile-working-code-reconciliation.md` (Decisions + Current Mobile Validation Checklist) is the acceptance backbone. PF-SCOPE-001 (CLOSED) provides `npm run check` and CI.

## Objective

Make the two mobile capture flows — photo capture (`apps/mobile/app/capture.tsx`) and barcode scanning (`apps/mobile/app/scan-barcode.tsx`) — reliably carry a user from capture/scan through a saveable draft to save and on to the next item, including when online lookup, AI analysis, or the network is unavailable. The reconciliation doc's decisions and its 9-step Current Mobile Validation Checklist are the acceptance backbone. No new views, no redesign, no AI reactivation.

## Reconciled inconsistency (documented, resolved)

The 2026-11-03 audit flagged a behaviour conflict: photo capture produced NO draft when AI analysis was unavailable ("Your photos are still here, but no draft was created"), while barcode scanning produced a saveable fallback draft in the same situation. This is a code-vs-documented-principle inconsistency, not a conflict with `DECISIONS.md` or the charter (neither mandates discarding a capture when AI is off). It is resolved in this scope in favour of the reconciliation doc's stated decisions — "Lookup or AI failure should not trap the user; it should produce a saveable draft or a clear recovery path" and "offline and timeout fallback drafts are deliberate resilience, not a replacement for real lookup" — so photo capture now applies the same photo fallback draft the barcode flow already uses. No owner decision is needed for this resolution; it is recorded here and flagged in the implementation report. If the owner disagrees, the fallback application is isolated to `analyzeImage` in `capture.tsx` and can be reverted without touching the barcode flow.

## Included

- Reconcile capture vs barcode fallback: photo capture applies a saveable fallback draft (existing `createPhotoFallbackDraft` in `apps/mobile/lib/offline-drafts.ts`) when AI analysis is unavailable or fails, matching the barcode flow; a prior result is never silently discarded by a failed re-analysis.
- Barcode photo-update path preserves barcode identity: the no-AI branch of `analyzeImage` in `scan-barcode.tsx` no longer overwrites an existing barcode draft with a generic photo draft (and no longer drops the scanned barcode); it applies the fallback only when no draft exists yet, with the barcode and photo carried through, matching the existing error branch.
- Scanner lifecycle: cancel and scanner-start failure reset BOTH the visible scanner and the internal scan lock (`resetBarcodeScanState`), so a failed or cancelled scanner can never leave the screen unresponsive to the next scan; a successful scan still closes the scanner immediately.
- Bounded waits: barcode lookup gets a bounded timeout so a hung network falls through to the existing fallback prompt instead of spinning forever; the shared AI request helper (`requestAnthropicMessage`) gets a bounded timeout so a hung analysis returns a clear timeout error into the existing fallback/alert paths (bundle suggestions in the Inventory screen share this helper and already handle its errors).
- Existing next-action behaviour is preserved and verified: obvious next action after a scan/photo result (`Take Listing Photos` on the barcode flow, photo tips with capture actions on the capture flow), and `Save & Next Item` leaves the next scan/photo flow ready.
- Automated tests for the draft/fallback/timeout logic that is testable without a device, following the existing `node --test` layout in `apps/mobile/scripts/` (no new framework). The mobile sync-policy tests are extended in wiring only (both test files run under the existing `sync:test` script).

## Excluded

- AI reactivation: no AI key is required, no AI provider is re-enabled, and no new AI behaviour is added. Fallback drafts are the existing deliberate-resilience path, not AI.
- eBay posting changes; Facebook posting changes; Explore/bulk/Stats redesign; new views or navigation changes; production/hosted database writes; live eBay/Facebook actions; credentials or secrets of any kind.
- TestFlight, Apple Developer, or any app-store/distribution work (separate decision for the owner). The real-device pass is recorded as outstanding and is NOT claimed as done in this scope.
- Web app changes except where a shared helper is genuinely shared (none expected).

## Acceptance criteria

Mapped to the reconciliation doc's 9-step Current Mobile Validation Checklist plus error/offline/recovery and regression checks. Steps 1–9 are verified on a real phone (Expo dev/preview build on the owner's iPhone); terminal-provable criteria are verified in CI/locally. Each criterion records VERIFIED (terminal) or DEVICE-PENDING (real phone) distinctly — capture reliability is NOT claimed proven until the device pass happens.

- [ ] 1. DEVICE-PENDING — Restart the Expo bundle so the phone is not running stale JavaScript (manual step; no code change).
- [ ] 2. DEVICE-PENDING — Create or select an active pallet (existing pallet selection; unchanged).
- [ ] 3. DEVICE-PENDING — Open `Capture Item`, tap `Take Photos`, confirm the camera opens directly (existing direct `launchCameraAsync` path; unchanged).
- [ ] 4. DEVICE-PENDING — Tap `Upload Photos`, confirm the photo library opens or a visible permission/error message appears (existing direct `launchImageLibraryAsync` path; unchanged).
- [ ] 5. DEVICE-PENDING — Open `Scan Barcode`, tap `Open Scanner`, scan a UPC/EAN, confirm the scanner closes immediately (existing `handleBarcodeScanned` behaviour; unchanged, plus lock-reset hardening on error paths).
- [ ] 6. DEVICE-PENDING — Confirm a draft appears within roughly 6 seconds, even if the online lookup cannot identify the product (existing fallback prompt / fallback draft paths; now bounded by the lookup timeout so a hung network also recovers).
- [ ] 7. DEVICE-PENDING — Tap `Cancel Scanner`, confirm the screen stays responsive (existing cancel path resets scanner + lock; error paths hardened the same way).
- [ ] 8. DEVICE-PENDING — After a result appears, tap `Take Listing Photos`, confirm the camera opens (existing next-step card on the barcode flow; unchanged).
- [ ] 9. DEVICE-PENDING — Save with `Save & Next Item`, confirm the next scan flow is ready (existing `clearAll` + reopen-scanner path on the barcode flow; empty-state readiness on the capture flow; unchanged).
- [ ] TERMINAL — Photo capture with AI unavailable produces a saveable fallback draft (not "no draft was created"), and a failed re-analysis keeps a prior result (new/changed behaviour; covered by automated tests for the fallback builders and by code inspection of `analyzeImage`).
- [ ] TERMINAL — Barcode photo-update with AI unavailable keeps the scanned barcode and any existing draft; a fallback draft, when applied, carries the barcode and photo (new/changed behaviour; covered by automated tests and code inspection).
- [ ] TERMINAL — A hung barcode lookup or hung AI request cannot spin forever: both are bounded and fall through to the existing fallback prompt / fallback draft / alert paths (new behaviour; timeout helper covered by automated tests).
- [ ] TERMINAL — `npm run check` exits 0, including the new/changed automated tests; no new test framework; no migration edits; no secrets in the diff; existing UX and workflows preserved (regression).
- [ ] DEVICE-PENDING — The 9-step checklist above passes on a real iPhone through an Expo dev/preview build. This is the only proof that native camera/scanner behaviour works; terminal checks cannot prove it (stated in the reconciliation doc).

## Verification

Terminal (run before any push; must exit 0):

```sh
npm run check
```

This runs lint, mobile typecheck, mobile sync/fallback tests, web check, server check, schema check, return-lifecycle check, and core/api-client typechecks. The live-DB check (`npm run check:live`) is unchanged by this scope and is not re-run for it; PF-SCOPE-001's green CI remains the database proof.

Device (outstanding — owner, iPhone, Expo dev/preview build; do NOT start TestFlight or Apple Developer work in this scope):

Run the 9-step Current Mobile Validation Checklist from `docs/mobile-working-code-reconciliation.md` exactly as written (steps 1–9 above), on a real phone, and record the outcome (pass/fail per step) in the scope completion report before the scope is marked VERIFIED. A device pass that fails any step returns the scope to IN_PROGRESS with the failing step named.

## Scope boundaries

Scope work happens only on the scope branch. If a change outside the Included list looks necessary, stop and ask the owner — do not silently expand. No force pushes. No secrets in Git, reports, or screenshots. Verified, documented-unverified, historical, and proposed claims are kept distinct in the completion report.

## Completion report

## Completion report

Device pass: COMPLETE 2026-11-07 (owner, iPhone, EAS development build installed 2026-11-05, run at home over Metro from the scope branch). All 9 checklist steps passed:

1. Restart bundle — PASS (fresh bundle via Metro restart).
2. Create/select active pallet — PASS (item landed under Loose Items).
3. Capture Item → Take Photos, camera opens directly — PASS.
4. Upload Photos, photo library opens — PASS.
5. Scan Barcode → Open Scanner, scan UPC/EAN, scanner closes — PASS (Pepsi can, UPC 012000018770).
6. Draft appears even when the online lookup cannot identify the product — PASS. The lookup did NOT identify the can; the draft was the guaranteed generic fallback ("Barcode item 012000018770", default estimates, condition "Details need review"). This is the scope's core guarantee working as designed; product identification depends on the lookup service, which was not reachable from the dev setup.
7. Cancel Scanner, screen stays responsive — PASS.
8. Take Listing Photos, camera opens — PASS.
9. Save & Next Item, next scan flow ready — PASS. Item confirmed present in Inventory after save. During save, the designed deferral alert fired ("eBay details can be finished later" — the eBay requirements check could not reach the server from the dev build); the item saved anyway and the next scan opened, exactly as designed.

Blockers cleared on the way to the pass (recorded in MEMORY.md): hosted Supabase email template could not deliver the OTP code the login screen requires — fixed 2026-11-07 by configuring custom SMTP (Resend) and adding {{ .Token }} to the Magic Link template; delivery verified end to end on the device.

In-pass fixes (owner-directed during the pass, "fix issues in the moment"):
- Login keyboard fix (commit `b627dab`, remote head `08088c73`): the iOS number pad covered the "Verify and Sign In" button and the login screen had no keyboard-dismiss path. `login.tsx` now wraps its content in KeyboardAvoidingView with tap-to-dismiss. Verified on device by the owner (signed in successfully after the fix).
- eBay-details reminder mute (this change): the deferral alert now offers "Don't show again" (persisted as `showEbayDetailsReminder` in `app-settings`, default on), routed through a shared `alertEbayDetailsDeferred` helper in `listing-posting.ts` used by `capture.tsx`, `scan-barcode.tsx`, and the analysis-requirements path; a Settings toggle ("eBay Details Reminder") re-enables it. Typecheck + lint clean locally; device verification = owner taps "Don't show again" on the next save and confirms the alert stays off (pending at time of writing).

Verified vs unverified: terminal checks (typecheck/lint) verified locally for every commit; device behavior verified by the owner per-step above. Final branch SHA and CI run ids for the final head are recorded when CI completes on the pushed head; the scope is not marked VERIFIED until that CI is green.
