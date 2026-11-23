# PF-SCOPE-008 — Core alignment follow-up (Node-resolvable core entry + provably-identical helpers)

Status: CLOSED — VERIFIED 2026-11-23 (build merged as PR #47, main 2ab699b8; manual desktop-browser pass recorded below)
Owner approval: APPROVED 2026-11-04 ~10:24 MST (build in sequence after PRs #4–#7 merged — long since satisfied); start word given 2026-11-23.

Objective: Finish the job PF-SCOPE-006 started without redoing it: make `packages/core` importable from plain Node ESM as well as from Vite/Metro, migrate the two helpers already proven behaviour-identical (`hasListingPhoto`, `isMissingPlatformListing`) to core imports at their web expression sites, and document the remaining divergences as intentional. No behaviour change on either surface.

Current evidence: PF-SCOPE-006 (CLOSED 2026-11-11) wired the web to `@palletscanner/core` for `getItemPhotos` only; its Findings record the rest as deliberately unmigrated, with `hasListingPhoto`/`isMissingPlatformListing` proven identical but blocked because their call sites live in Node-imported modules and the core entry was not Node-resolvable. Entry failure re-reproduced on this branch's base (Node v24.22.1, from `apps/web`): `import('@palletscanner/core')` → `ERR_UNSUPPORTED_DIR_IMPORT` ("Directory import '.../packages/core/src' is not supported"), thrown by the root `index.ts` re-export of `./src`; the full chain is 10 extensionless re-exports in `src/index.ts` plus 7 extensionless cross-file imports, including one value import (`item-status.ts` ← `hasListingPhoto` from `./inventory-query`). Code-health audit (2026-11-11) riders: core's private duplicate `hasListingPhoto` at `posting-readiness.ts:9`, and zero direct unit tests for core's 990 LOC.

Included:
1. Entry fix — **Option A (explicit `.ts` extensions), chosen and verified** (see "Entry-fix decision" below). Options B (compiled `dist/`) and C (split entries) were not needed and were not taken.
2. Migration of the proven helpers at their web expression sites: `dashboard-model.js` (photo check in `workflowStatusByItemState`; platform checks in `getMarketplaceQueueItems` and `summarizeInventory`), `inventory-repository.js` (`listPhotos`), and `supabase-inventory-repository.js` (`syncItemPhotos` photo list) — the three Node-imported modules the 006 Findings named. Platform migration is facebook/ebay only, matching core's filtered semantics and the 006 precision note.
3. Audit riders: delete core's private `hasListingPhoto` copy (`posting-readiness.ts`) and import the canonical helper from `inventory-query.ts`; add direct unit tests for `packages/core` pinning the inventory-query/item-status helpers, wired into the root check pipeline.
4. Divergence documentation: `packages/core/README.md` ("Intentional divergences from the web app" + entry-resolution note), brief comments at the two divergence sites in `dashboard-model.js`, and a follow-up note appended to the PF-SCOPE-006 scope doc.

Excluded: `packages/api-client` adoption or entry changes; any change to mobile core semantics, helper signatures, or runtime behaviour; any behaviour change on either surface; the `listedPlatforms?.includes(...)` row-building conditions in `supabase-inventory-repository.js` (different semantics — "has any listing trace", not "missing listing" — deliberately left as-is); new features; migrations; AI/eBay changes; hosted writes; credentials.

Preserved UX: the web and mobile apps look and behave identically throughout; this scope is invisible to the operator except in code.

Dependencies: PF-SCOPE-006 merged (satisfied); npm workspaces install. No credentials, no device pass, no hosted anything.

Risks and protected operations: core is shared with mobile — an entry fix that changes Metro resolution or any helper's behaviour breaks the surface the owner uses daily. Mitigations applied: behaviour-preserving fix only; triple-resolution proof (Node entry import, Vite build, Metro bundle via `expo export`); equivalence tests imported through the entry; export-surface pin in the new core tests. No protected operations were performed.

## Entry-fix decision (recorded per the proposal)

**Option A — explicit `.ts` extensions on all relative imports/re-exports in `packages/core`** (root `index.ts`, `src/index.ts`, and the cross-file imports in inventory-query, inventory-report, inventory-repository, item-status, metrics, posting-readiness), plus `allowImportingTsExtensions: true` in the two tsconfigs whose programs compile core sources: `packages/core/tsconfig.json` and `apps/mobile/tsconfig.json` (mobile maps `@palletscanner/core` to the source entry via tsconfig paths, so its program compiles these files; without the flag it reports TS5097 on the re-export/value-import lines — type-only imports are erased and do not need it). This is the proposal's anticipated accommodation, not a switch of option: the source stays the entry, no build step was added, and no exported name, signature, or runtime behaviour changed (the new core tests pin the exact 34-name value-export surface).

Verification of the choice:
- Node ESM: before — `ERR_UNSUPPORTED_DIR_IMPORT`; after — `import('@palletscanner/core')` from `apps/web` resolves and exposes the full surface; `getItemPhotos({photo: "x.jpg"})` spot-check matches 006's recorded behaviour.
- Vite: `vite build` inside `npm run dashboard:check` — exit 0.
- Metro: `EXPO_OFFLINE=1 npx expo export --platform ios` in `apps/mobile` completed and produced the app bundle (Hermes bytecode, 4.78 MB) with the `.ts`-extension core chain inside it — Metro resolves explicit `.ts` specifiers in this chain.
- Typecheck: `npm run core:typecheck`, `npm run mobile:typecheck`, `npm run api-client:typecheck` all exit 0.

## Acceptance criteria

- [x] Observable user result: `import "@palletscanner/core"` resolves and the full export surface is importable from plain Node ESM (smoke-proven, above), from the Vite web build, and from Metro (expo export) + the mobile typecheck — with no helper added, removed, renamed, or re-behaved (export surface pinned by test; equivalence suite green).
- [x] Error/offline/recovery behavior: unchanged — no new failure modes; the entry fails loudly at import time if it regresses (the core unit tests import through the entry and would fail at load).
- [x] Data/security and regression checks: `npm run check` exit 0 (mobile lint 0 errors, mobile typecheck, mobile sync tests 18/18, web suite 98/98 incl. check.mjs web-shape pins + Vite build, server tests 49/49, schema check, return-lifecycle check, core typecheck, core tests 21/21, api-client typecheck); equivalence tests for the migrated helpers import through the ENTRY and pass (49/49); divergences documented; no migration, RLS, eBay, or AI behaviour change; no secrets in the diff.
- [x] Manual desktop-browser pass over Review, Inventory, Pallets, and Analysis on the deployed build, comparing behaviour on the same data — DONE 2026-11-23 (deployed app, cloud data, read-only): all four sections render, no blank/broken/erroring section; Review counts (Inventory risks 0, Needs decision 1 — the photo-less "sup", Publishing issues 0, Aging 2) match the migrated helpers' expected behaviour; Inventory 3 active / 7 archived matches badges and Overview; Pallets item counts sum to 3 and costs to $203 = Overview pallet cost. Observations recorded (pre-existing analytics semantics, not regressions — this scope changed no computation, and the equivalence suite pins identical outputs): Overview reports Sold items 0 / Sold revenue $0 while Data/Analysis reports Recorded sales 2 / Gross revenue $210 (the two surfaces use different definitions/denominators — Analysis sell-through uses all 10 items incl. archived); Analysis return rate shows 100.0% although 1 of 2 recorded sales was returned; Projected available value $6,051 has no on-page breakdown. These belong to the analytics-surfaces conversation (cf. runbook gaps 13–15), not to this scope.

Verification: `npm run check` (exit 0, run twice on the final tree); `npm run core:test` standalone (21/21); `node --test apps/web/scripts/shared-packages-equivalence.test.mjs` (49/49, entry-imported); Node entry-import smoke (command + before/after output recorded above); `npx expo export --platform ios` (Metro proof, above).

Branch: scope/PF-SCOPE-008-core-alignment
Deliverables: entry fix (Option A) + migrated helpers + entry-imported equivalence suite + direct core unit tests wired into the pipeline + divergence documentation (core README, dashboard-model comments, 006 follow-up note) + this scope document + register update.

## Completion report

Status: CLOSED — VERIFIED 2026-11-23 (browser pass recorded under Acceptance criteria).
User-visible changes: none (resolution- and code-organization-only, by design).
Evidence/tests: as recorded under Acceptance criteria and Entry-fix decision.
Remaining gaps/risks: none for this scope; the 1 pre-existing mobile lint warning is untouched (0 errors). The browser pass's analytics observations are recorded under Acceptance criteria as pre-existing semantics, not gaps in this scope.
Commit SHA: recorded in the PR.
Owner decision required: none for the build; CLOSED requires the browser-pass evidence.
Proposed next scope: none from this scope; the register's sequencing has the mobile Inventory split after 008.
