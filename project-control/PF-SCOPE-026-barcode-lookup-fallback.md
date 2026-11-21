# PF-SCOPE-026 — Barcode lookup fallback (mobile)

Status: IN_PROGRESS (built 2026-11-20; see Verification)
Owner approval: 2026-11-20 ("Fix both" — this lookup fix alongside the
scan-flow form treatment on the design experiment branch).

## Problem

Owner device report, 2026-11-20: scanning a well-known product (Apple
AirPods 4, UPC 195949688522) ended at "Barcode needs review — Barcode
lookup timed out", even though the lookup sources can name that product
in ~1s. The on-screen detail confirmed the scanner read the correct UPC;
the failure was in the lookup, not the scan.

Root cause, verified by code read of `apps/mobile/lib/barcode-lookup.ts`:
when `BARCODE_API_BASE_URL` is set (production builds point it at the
Render backend), `lookupBarcodeProduct` called the backend
`/barcode/lookup` first and **threw on any failure** — the direct-source
chain in the same function only ever ran when the base URL was empty.
The backend fetch also had no timeout of its own, while
`app/scan-barcode.tsx` wraps the whole lookup in 15s
(`BARCODE_LOOKUP_TIMEOUT_MS`, `lib/timeout.ts`). The Render free-tier
backend sleeps when idle and cold-starts in ~50s, so a scan against a
sleeping backend hung the fetch until the outer 15s killed the entire
lookup — the direct sources never got a chance. A backend 404 failed
the lookup outright too, even though the backend's own sources race
with 7s timeouts and can miss transiently.

## Change

`apps/mobile/lib/barcode-lookup.ts` only:

- The backend attempt moved verbatim into a new `lookupViaBackend`
  helper, with one addition: the fetch now carries
  `AbortSignal.timeout(6_000)` (`BACKEND_LOOKUP_TIMEOUT_MS`). A warm
  backend answers in ~1–2s; a sleeping one fails fast, leaving room
  for the direct chain inside the caller's 15s budget.
- `lookupBarcodeProduct` catches **any** backend failure — network
  error, abort/timeout, bearer-token failure, or a non-OK status
  (404 and 5xx included) — and falls through to the existing
  direct-source chain (UPCitemdb trial → OpenFoodFacts v3 →
  OpenFoodFacts v0 → GTINhub, across the barcode candidates).
- Happy paths unchanged: a backend success returns its result exactly
  as before, and an empty base URL runs the direct path exactly as
  before. The direct chain itself is untouched, so its error
  distinctions survive the fallback — a genuine no-match still ends at
  "No product found for that barcode.", and a rate-limited primary
  still ends at the rate-limit message.

## Out of scope

- `app/scan-barcode.tsx` UI and copy — the caller's 15s timeout and its
  messages stay as they are.
- The backend service (`server/barcode-service.mjs`) and its own
  source racing.
- Scanner symbology restrictions (code128/code39) — raised during
  diagnosis, but the device evidence showed the correct UPC was read,
  so no change.
- A registered UPCitemdb API key or additional lookup sources —
  possible later hardening, separate approval.

## Acceptance

- Scan with the backend asleep or unreachable: the lookup resolves via
  the direct sources instead of timing out.
- Scan with the backend awake: the result comes from the backend,
  unchanged.
- Scan of a genuinely unknown barcode: still ends at "No product
  found for that barcode."
- Root `npm run check` green.

## Verification

- Root `npm run check`: **exit 0** at build time (lint, mobile
  typecheck, mobile sync tests 18/18, web check + build, server
  checks, schema contract, return-lifecycle 18/18, core + api-client
  typechecks). Mobile lint shows exactly one warning — the
  pre-existing `@typescript-eslint/array-type` warning on
  `firstText`'s `Array<unknown>` in this file, untouched by this
  change (line 77 on main; line 81 here, shifted by the added
  constant). No new warnings.
- Unit tests: **none added, deliberately.** The mobile Node test
  harness (`apps/mobile/scripts/*.test.mjs`, run by
  `mobile:sync:test`) imports dependency-free lib modules directly.
  `barcode-lookup.ts` imports `@/lib/app-auth`, which does not resolve
  under plain Node (verified at build time:
  `ERR_MODULE_NOT_FOUND — Cannot find package '@/lib'`) and pulls in
  `expo-file-system`, `expo-secure-store`, and `react-native`. No
  fitting harness can import this module, so no cases were forced;
  verification is the root check plus the before/after read of the
  full function recorded in the PR.
- Owner device pass: pending — scan a known product with the backend
  idle after the fix reaches the phone via EAS Update.
