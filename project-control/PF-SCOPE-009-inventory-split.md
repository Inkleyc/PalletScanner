# PF-SCOPE-009 — Mobile Inventory split (explore.tsx, move-only)

Status: VERIFIED (build) — implementation, staged-commit checks, root check, and diff-discipline evidence complete on the scope branch; the device smoke pass is still PENDING (owner-side, via the `experiment/inventory-split-comparison` branch copy or a preview build after merge) and final CLOSED waits on it plus owner review, per this scope's acceptance rule that terminal evidence alone does not close the scope.
Owner approval: APPROVED 2026-11-23 07:49 MST ("009 approved"). Proposal drafted 2026-11-04.

Objective: Split the single mobile Inventory screen file (`apps/mobile/app/(tabs)/explore.tsx`, 2,845 lines on the branch base `c589ce83`) into focused modules — one per real section the file contains — strictly as a move, not a rewrite: same logic, same messages, same flows, zero behaviour change.

Current evidence: `explore.tsx` is 2,845 lines on `main` @ `c589ce83` (the proposal measured 2,803 on 2026-11-04; the file has since grown slightly through merged design work). It exports exactly one thing, the default `InventoryScreen` component, registered as the `explore` tab titled "Inventory" in `apps/mobile/app/(tabs)/_layout.tsx`. Nothing imports from it; `apps/mobile/app/scan-barcode.tsx` reaches it only by route string. Section map re-verified against the branch base (line numbers are the base file's):

- Lines 1–82: imports.
- Lines 84–102: `BundleSuggestion` type, demo inventory seed data (7 items, ids 910001–910007), `DEMO_INVENTORY_ENABLED` flag.
- Lines 105–140: module helpers — `getListedPlatforms`, `hasListedPlatform`, `displayText`, `displayNumber`, `displayId`, `displayPhotoUri`, `displayQuantity`, `displaySoldPrice`.
- Lines 142–259: `InventoryScreen` shell — theme/styles, store subscriptions (`useSyncExternalStore` for inventory, pallets, active pallet, auth), ~20 `useState` fields, layout refs, `selectedPallet`/`activePallet`, the dev-only demo-seed `useEffect`, `getPalletName`, `filterOptions`/`filteredItems` memos, `selectedItem`.
- Lines 261–365: item-detail handlers — `openItemDetails`, `updateItemDetailDraft`, `saveItemDetails`, `postItemFromDetails`, `markSoldFromDetails`, `removeItemFromDetails`.
- Lines 367–433: derived data — `palletScopedItemCount`, value summary, `bundleCandidateItems`, missing-eBay/Facebook/draft/missing-URL/no-photo memos, `hasActiveFilters`, `showItemTools` stub, `getWorkflowStatusStyle`, filters-expand effect.
- Lines 435–649: item-row actions — `endItemEbayListing`, `removeItem`, sold-price draft get/save/clear, `confirmUnmarkListed`, `showItemActionMenu`, Facebook-URL paste/save/clear.
- Lines 647–712: export — `getExportFilename`, `exportCSV`, `emailInventory`.
- Lines 714–843: bulk queues — eBay and Facebook open-next/start/continue/cancel.
- Lines 845–876: pallet actions — `makeSelectedPalletActive`, `removeSelectedPallet`.
- Lines 878–935: `suggestBundle` (Anthropic request; AI-unavailable alert when the secure backend is unconfigured).
- Lines 937–1117: render — header/title, filter card with inline controls on large layouts.
- Lines 1119–1278: filter modal (small layouts; the same controls duplicated).
- Lines 1280–1446: summary card (totals, readiness counts, Export CSV / Email / bulk eBay / bulk Facebook / bundle buttons).
- Lines 1448–1468: empty state.
- Lines 1470–1846: item list — one card per filtered item.
- Lines 1848–1901: item-detail modal.
- Lines 1903–1938: bundle-suggestions modal.
- Lines 1942–2845: a single `createStyles` block (~195 style keys).

Included:
1. Move each section into its own module under a new `apps/mobile/components/inventory/` folder (following the existing `apps/mobile/components/` convention). Confirmed placement (the proposal left exact names to the implementing scope):
   - `inventory-helpers.ts` — `BundleSuggestion` + `ItemDetailDraft` types, demo seed + flag, display/platform helpers.
   - `inventory-styles.ts` — the `createStyles` block moved verbatim as a single module, plus an exported `InventoryStyles` type. Placement decision: the stylesheet is NOT partitioned per component. ~195 keys are shared across sections (e.g. `filterLabel`, `sectionHeader`, `sortChip*` are used by both the filter card and the filter modal; `totalLabel` spans the summary card), so partitioning would force either duplicated keys or value edits. One verbatim styles module guarantees zero style-value drift; each component receives the shared styles object as a prop.
   - `use-inventory-actions.ts` — all handler families (item-detail, item-row, export, bulk queues, pallet actions, `suggestBundle`) as one `useInventoryActions` hook taking a single typed input object (state values + setters + derived lists from the shell) and returning the handlers. Handler bodies move verbatim; cross-family calls (`markSoldFromDetails` → `endItemEbayListing`, `removeItemFromDetails` → `removeItem`, `postItemFromDetails` → `saveItemDetails`) stay inside the hook.
   - `inventory-filters.tsx` — `InventoryFilterCard` (header + inline large-layout controls) and `InventoryFilterModal` (small-layout modal). The two control sets are near-duplicates in the original and remain separate components with their JSX verbatim — they are NOT unified (unifying them would be a behaviour-risking rewrite, out of scope).
   - `inventory-summary.tsx` — `InventorySummaryCard`.
   - `inventory-item-card.tsx` — `InventoryItemCard` (one item row, including the workflow-status bar, listed banners, and the gated tool sections), with `showItemTools` and `getWorkflowStatusStyle` moved alongside it.
   - `inventory-empty-state.tsx` — `InventoryEmptyState`.
   - `item-detail-modal.tsx` — `ItemDetailModal`.
   - `bundle-suggestions-modal.tsx` — `BundleSuggestionsModal`.
2. `explore.tsx` remains the route file: it keeps the default `InventoryScreen` export, the store subscriptions, all screen state, the derived memos, the demo-seed effect, and the composition of the extracted modules — nothing else. The tab registration in `_layout.tsx` is untouched (byte-identical).
3. The demo-seed data, flag, and effect move/remain verbatim (same gates: `__DEV__`, the demo flag, test mode, signed-out state).
4. One section per commit, each commit independently reviewable and revertible, each leaving mobile typecheck + lint green.
5. An `experiment/inventory-split-comparison` branch copy of the finished split so the owner can feel/function-test the split against the in-line version side by side; the experiment branch is never merged.

Excluded: any behaviour, UI, copy, message, sort/filter, pricing, or navigation change; any new feature; any change to `@palletscanner/core` helper semantics or to any `@/lib` module; any data-model, route, or tab change; any AI re-enable (the bundle flow keeps its existing AI-unavailable alert path; no live AI call is made to verify it); removal of the `showItemTools` stub or any other dead code (moved verbatim); unifying the duplicated filter controls.

Preserved UX: the Inventory tab looks, reads, and behaves identically throughout — same screens, same labels, same button text, same alert wording, same filter/sort/status options, same large-layout vs small-layout behaviour (inline controls at width ≥ 900, filter modal below it). Same validation messages and same floor/approved-price rules wherever they surface.

Dependencies: PF-SCOPE-008 merged (satisfied — branch base is `c589ce83`, after the 008 closeout); npm workspaces install. No owner input needed beyond the approval already given; no credentials; no new packages.

Risks and protected operations: this is the highest-touch screen in the app; a subtle slip in a move would be user-visible. Mitigations: move-only rule, one section per commit, typecheck + lint per commit, whitespace-normalized diff comparison of every moved block against the base file, the behaviour checklist below, the experiment-branch comparison, and the device smoke pass. No protected operations: no hosted-database writes/migrations, no credential/auth/RLS changes, no live eBay/Facebook actions, no deployments (no EAS update is published by this scope), no billing, no destructive operations.

Acceptance criteria:
- [ ] Observable user result: the Inventory tab renders and behaves identically to the pre-split build across every flow in the behaviour checklist below, on the same data, in both large (≥900px) and small layouts.
- [ ] Error/offline/recovery behavior: unchanged — same alerts for AI-unavailable, bundle failure, and destructive confirms; same offline/sync behaviour (no store or sync code is touched).
- [ ] Data/security and regression checks: `npm run check` exit 0 from the repo root (includes mobile typecheck, lint, sync-policy tests, and all other checks); no new lint warnings beyond the one known pre-existing warning in `apps/mobile/lib/barcode-lookup.ts`; the route file keeps its single default export and the tab registration is byte-identical; no secrets in the diff.

Verification: `npm run check` (root) at completion; mobile `typecheck` (`tsc -p tsconfig.json --noEmit`) and `lint` (eslint) after every staged commit; staged-commit review (each commit moves exactly one section and passes the checks); whitespace-normalized text comparison of each moved block against the base file (diff discipline evidence in the completion report). Behaviour checklist — every item verified on a real iPhone in the device smoke pass, or marked N/A with a reason: (1) open the Inventory tab; header, pallet chips, search, sort, and status filters all present and working; (2) switch pallet, search, sort, and filter — list and counts update exactly as before; (3) summary card totals and readiness counts match the pre-split build on the same data; (4) Export CSV and Email Inventory produce the same output; (5) bulk eBay and bulk Facebook queues start, continue, and cancel (queue mechanics only — no live listing is posted); (6) bundle suggestions show the AI-unavailable alert when the backend is unconfigured (no live AI call); (7) open an item, edit every detail field, save, and confirm the change persists and the list reflects it; (8) post buttons are verified only to their confirm/alert step — NO live eBay/Facebook posting during verification (protected operation); (9) mark-sold / edit-sold-price, remove-item confirm, unmark-listed confirm, and end-eBay-listing flows behave as before, stopping short of any live marketplace action; (10) empty state, filter modal (small layout), and inline filter controls (large layout) all render correctly. No real customer data in testing: test mode / demo seed path or isolated test data only. Per the proposal, VERIFIED requires the green check run AND the device smoke pass AND owner review — the build record below therefore records the automated evidence and diff discipline, and the smoke pass remains an owner-side step (this scope does not publish an EAS update).

Branch: scope/PF-SCOPE-009-inventory-split
Deliverables: split modules + thin route shell, staged commits (one section per commit), this scope document, register update, completion report with final SHA + check evidence + the recorded smoke-pass mechanism, and the experiment-branch comparison note.

## Follow-up observations (out of scope — recorded, not acted on)

- None spotted during the split. No behaviour oddity was found in the moved code; anything that looked like an improvement was left exactly as it was, per the move-only rule.

## Completion report

Status: VERIFIED (build) — device smoke pass pending (see below).
User-visible changes: none (code-organization-only, by design).
What moved where (base `c589ce83`, explore.tsx 2,845 lines → 426-line route shell):
- `components/inventory/inventory-helpers.ts` (74 lines) — `BundleSuggestion` + `ItemDetailDraft` types, demo seed + `DEMO_INVENTORY_ENABLED` flag, display/platform helpers.
- `components/inventory/inventory-styles.ts` (915 lines) — the `createStyles` block verbatim as one module + `InventoryStyles` type (placement decision recorded under Included).
- `components/inventory/use-inventory-actions.ts` (741 lines) — all handler families as the `useInventoryActions` hook (typed input object; handler bodies verbatim; cross-family calls stay inside the hook).
- `components/inventory/inventory-filters.tsx` (450 lines) — `InventoryFilterCard` + `InventoryFilterModal` (kept separate, not unified).
- `components/inventory/inventory-summary.tsx` (245 lines) — `InventorySummaryCard` (router passed as a prop so the Facebook-queue navigation line is unchanged).
- `components/inventory/inventory-item-card.tsx` (476 lines) — `InventoryItemCard`, with `showItemTools` and `getWorkflowStatusStyle` moved alongside (their only call site).
- `components/inventory/inventory-empty-state.tsx` (41 lines) — `InventoryEmptyState`.
- `components/inventory/item-detail-modal.tsx` (104 lines) — `ItemDetailModal`.
- `components/inventory/bundle-suggestions-modal.tsx` (63 lines) — `BundleSuggestionsModal`.
- `explore.tsx` keeps: the single default `InventoryScreen` export, store subscriptions, all screen state, derived memos, the demo-seed effect, the actions-hook call, and composition. `_layout.tsx` is byte-identical (zero diff). Largest file after the split: `inventory-styles.ts` at 915 lines (the verbatim stylesheet); largest logic module: `use-inventory-actions.ts` at 741 lines.
Evidence/tests:
- Staged commits (one section per commit, each independently green): bd90e9e (scope doc), da1e6cf (helpers), 660ab2d (styles), 166731d (actions hook), f62c475 (filters), b9b2aad (summary), f3bd1b2 (empty state + item card), 563890d (modals). Mobile `typecheck` + `lint` ran after every commit: exit 0, only the one known pre-existing lint warning (`apps/mobile/lib/barcode-lookup.ts`, `@typescript-eslint/array-type`) — no new warnings.
- Root `npm run check` on the final tree: exit 0 (lint, mobile typecheck, mobile sync tests, web dashboard check, server check, schema check, return-lifecycle check, core typecheck + 21 core tests, api-client typecheck).
- Diff discipline (the move-only proof): whitespace-normalized multiset comparison of the base `explore.tsx` (2,758 non-empty lines) against the union of the new shell + all nine modules. Every base line survives verbatim except 16, each fully explained: 12 declarations that gained an `export` prefix in their new module (the demo seed, the demo flag, `createStyles`, `BundleSuggestion`, and the 8 display/platform helpers); 2 import-list lines whose imports became single-line imports in the new modules (`StyleSheet`, `updateInventoryItemFacebookStatus`); 1 import-list line folded into a single-line import in the shell (`calculateInventoryValueSummary`); and the item card's root `<View key={itemKey} style={styles.itemCard}>`, whose `key` moved to the map call site (computed identically: `displayId(item.id) ?? \`item-${index}\``) — the one JSX attribute relocation inherent to extracting a list row into a component. All remaining new lines are glue: module imports, prop-type definitions, prop destructuring/passing, the hook's input/return plumbing, and component-usage JSX. A logic-token scan (Alert/await/if/setTimeout/JSON) of the new-only lines found no altered or added logic.
- Import/export surface: the route file keeps exactly one export (default `InventoryScreen`); nothing imported `explore.tsx` before or after; the tab registration is untouched.
Remaining gaps/risks: the device smoke pass (the 10-item behaviour checklist in Verification) has NOT run — this scope publishes no EAS update, so it runs owner-side from the `experiment/inventory-split-comparison` branch copy (pushed with this build, never merged) or from a preview build of `main` after this PR merges. The scope is not CLOSED until that pass and owner review are recorded. The 1 pre-existing mobile lint warning is untouched (0 errors).
Commit SHA: recorded in the PR.
Experiment-branch comparison note: `experiment/inventory-split-comparison` is a straight copy of this scope branch's tip, pushed for side-by-side feel/function testing against the pre-split build (from `main` before merge, or any earlier preview build). It carries no changes of its own and is never merged.
