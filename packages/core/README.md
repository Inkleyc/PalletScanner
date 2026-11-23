# @palletscanner/core

Shared domain logic for PalletFlip: inventory queries and filters,
workflow status, ledger balances, totals/metrics, listing drafts,
posting readiness, parsing, repository types, and report builders.
Consumed by `apps/mobile` (Metro/Expo) and `apps/web` (Vite), and
importable from plain Node ESM.

## Entry resolution (PF-SCOPE-008, Option A)

The package entry is the TypeScript source (`index.ts` →
`src/index.ts` → the module files). Every relative import/re-export in
that chain carries an explicit `.ts` extension. That is what makes one
specifier — `@palletscanner/core` — resolve identically under Node
ESM, Vite, and Metro:

- Node ESM rejects extensionless specifiers and directory imports
  (before this fix, importing the entry threw
  `ERR_UNSUPPORTED_DIR_IMPORT`).
- TypeScript consumers that compile these sources need
  `allowImportingTsExtensions` enabled (set in this package's
  tsconfig and in `apps/mobile/tsconfig.json`, whose program includes
  core via its path mapping). Type-only imports are erased and do not
  need the flag; value imports and re-exports do.
- Do not drop the extensions in a cleanup: the failure mode is that
  Node consumers break while bundler consumers keep working, so the
  regression is silent until a Node import is attempted. The direct
  unit tests in `test/` import the package by name through this entry
  and fail at import time if it regresses.

## Tests

`npm run test` (also wired into the root `npm run check` as
`core:test`) runs the direct unit tests in `test/` with `node --test`.
They pin the inventory-query and item-status helpers and the exact
export surface of the entry.

## Intentional divergences from the web app

PF-SCOPE-006 adopted core into the web only where behaviour was proven
identical, and PF-SCOPE-008 completed the two remaining proven helpers
(`hasListingPhoto`, `isMissingPlatformListing`, plus the `getItemPhotos`
expression sites in the web's Node-imported repository modules). The
families below were read in full and deliberately **not** aligned —
the web versions differ in semantics, not just in location. Do not
re-litigate them without new equivalence evidence; a helper that needs
a signature change to be adoptable is a new scope question, not an
edit to make here.

- **Field normalization** — the web tolerates dual field spellings
  (`low`/`low_price`, `cost`/`palletCost`), derives SKUs, and defaults
  balances (App.jsx `price()`, `normalizeItem` in
  inventory-repository.js, the Supabase row mapping). Core types are
  single-field (`low_price`, …); there is no core equivalent.
- **Summaries/metrics** — web `summarizeInventory` has its own output
  shape (including `needsFacebook`/`needsEbay` counts and a `margin`)
  and its `getQuantity` prefers `available` over `quantity`; core
  metrics (`calculateInventoryTotals`, `calculatePalletMetrics`) use
  quantity semantics and different shapes. `apps/web/scripts/check.mjs`
  pins the web shape.
- **Listing drafts/readiness** — the web's AI-merge falls back to the
  existing platform value where core `createListingDrafts` falls back
  to the general title; web platform content falls back to the item
  name where core `getPlatformListingContent` does not; and web
  readiness is computed server-side, so the web has no call site for
  `getPostingReadiness`.
- **Parsing** — no web call site shares the semantics of core's
  `parseMoneyAmount`/`parsePriceRange`/`parsePositiveInteger`/
  `sanitizeBarcodeValue`; the web uses ad-hoc `Number()` coercions and
  uppercases barcodes during normalization, which core does not.
- **`preferredListingPrice`** — a web-only rule in web-services.js
  driven by a localStorage preference; no core equivalent.
- **Workflow status, work filters, CSV/report builders, ledger** —
  the web's display status vocabulary (`captured`, `needs_photos`,
  `needs_research`, `ready`, `sold`, with an `item.status` override
  and dual-field price tolerance in dashboard-model.js) differs from
  core's `getInventoryWorkflowStatus` vocabulary and priorities; the
  web's Review queues are not core's `ListingFilter` vocabulary; and
  the web consumes server-computed ledger balances rather than
  computing them from a movements array as core's
  `calculateInventoryBalance` does.
