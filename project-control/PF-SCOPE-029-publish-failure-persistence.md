# PF-SCOPE-029 — Persist web publish failures
Status: VERIFIED (built 2026-11-21; live acceptance pending — see Verification)
Owner approval: APPROVED 2026-11-21 (from the PF-SCOPE-004 Drill 1 finding; build directed 2026-11-21, after PF-SCOPE-024 and PF-SCOPE-025)
Objective: A failed web publish to eBay leaves a durable, visible record — the item carries `ebayStatus: "error"` + `ebayLastError` (the exact eBay message), appears in Review → Publishing issues with the message shown, and clears on the next successful publish.
Current evidence: PF-SCOPE-004 Drill 1 (2026-11-21) — eBay rejected a $0.01 publish with "The Auto decline amount cannot be greater than or equal to the Buy It Now price. value is invalid."; after a refresh the Marketplace panel looked exactly as before the attempt and the item never appeared in Publishing issues (runbook gap 19). Code read confirmed the cause: `publishEbay` in `apps/web/src/App.jsx` saved `ebayStatus: "posting"` first, and its catch (and the requirements-answers resubmit catch) set only component-local error text; the persisted item was never updated.
Included:
- New `apps/web/src/ebay-publish-state.js`: the three persisted publish-state transitions (started / failure / success) plus `getPersistedPublishError`, so the transitions are directly testable (same pattern as PF-SCOPE-025's `timed-fetch.js`).
- `ListingReview` in `apps/web/src/App.jsx`: both publish catches now persist the failure via the shared `persistPublishFailure` helper (guarded — if the save itself fails, the local error text still stands); the started and success saves route through the same transition helpers. The success transition already cleared `ebayLastError`; it now does so by construction.
- Review queue rows render the stored message (`getPersistedPublishError`) under the item name, styled via a new `.publish-error` rule in `styles.css` — so Publishing issues shows *why*, not just *which*.
- Persistence rides the existing item-save path both ways: the local repository serializes whole items to localStorage, and the Supabase repository already maps the listing row's `status`/`last_error` in both directions — no schema or repository changes needed.
- Check coverage: `apps/web/scripts/ebay-publish-failure.test.mjs` (added to the web check list in `apps/web/package.json`) — transition unit tests, a mirror of the Publishing issues filter predicate, a local-repository storage round-trip proving the failure survives a refresh, and App.jsx wiring assertions.
Excluded: No backend changes; no change to the publish request itself or to eBay-side validation; no mobile changes; no retry logic (the owner re-publishes manually once the cause is fixed). Facebook draft errors are displayed by `getPersistedPublishError` when already persisted, but no Facebook flow changes were made.
Preserved UX: The Marketplace panel is unchanged (it already rendered `eBay: {ebayLastError}` when `ebayStatus === "error"` — it simply never received a persisted error before); the in-the-moment local error text still shows during the attempt; the Publishing issues tab and its count are the existing surface.
Dependencies: PF-SCOPE-004 (finding), PF-SCOPE-024/025 (sequenced ahead by the owner; both closed 2026-11-21).
Risks and protected operations: None — web-only, no hosted writes, no live eBay calls in the build or its tests.
Acceptance criteria:
- [x] Repeat Drill 1 in code: a rejected publish persists `ebayStatus: "error"` + the exact eBay message, and the persisted bytes survive a storage round-trip (local-repository test).
- [x] The failed item matches the Review → Publishing issues predicate and its stored message is what the queue row renders.
- [x] A successful re-publish of the same item clears the error state/message and removes the item from Publishing issues (transition test).
- [x] Root `npm run check` green, including the new check case.
- [ ] Live acceptance (post-merge, deployed app): repeat Drill 1 — after the failure AND a page refresh the item shows the persisted error with the eBay message and appears in Publishing issues; fix the cause, publish successfully, error clears. PENDING — runs after this scope merges.
Verification: Root `npm run check` green 2026-11-21 (incl. the 9 new ebay-publish-failure cases). Live pass intentionally not run pre-merge (local puppeteer broken; the cloud browser cannot reach localhost) — it runs on the deployed app after merge.
Branch: scope/PF-SCOPE-029-publish-failure-persistence
Deliverables: `apps/web/src/ebay-publish-state.js` (new), `apps/web/src/App.jsx`, `apps/web/src/styles.css`, `apps/web/scripts/ebay-publish-failure.test.mjs` (new), `apps/web/package.json`, this scope doc, SCOPES.md row.
