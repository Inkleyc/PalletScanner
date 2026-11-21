# PF-SCOPE-004 — End-to-end eBay sandbox proof

Status: CLOSED (VERIFIED 2026-11-21 — the full sandbox proof and all three failure drills completed; see Completion record)
Owner approval: APPROVED 2026-11-04 (all four scopes 004–007 approved by Colton); sandbox-call go-ahead given 2026-11-11 ("lets finish 4")
Branch: `scope/PF-SCOPE-004-ebay-sandbox-proof`
Runbook: `project-control/PF-SCOPE-004-runbook.md`

## Objective

Prove one complete workflow end to end, in sandbox only: a real item captured on a real phone, stored in the verified database, listed through the sandbox eBay integration, with an observed sandbox order reconciled and a return handled through the local return lifecycle — inventory and financial state consistent across mobile and web throughout. This is the sequencing principle in `FUTURE_DIRECTIONS.md`: prove one workflow end to end before expanding breadth.

## Current evidence (updated 2026-11-11)

- The eBay backend is a framework-free Node server, `server/ebay-server.mjs`. `EBAY_ENVIRONMENT` selects sandbox vs production base URLs; sandbox auth is `https://auth.sandbox.ebay.com/oauth2/authorize` (prompt=login, redirect via RuName); the server refuses sandbox credentials in production mode (client IDs containing `-SBX-`, secrets starting `SBX-`). Listing creation is `POST /ebay/listings`; outbound jobs run through `POST /ebay/jobs/execute`; listing end is `POST /ebay/listings/end`.
- Render deployment VERIFIED read-only 2026-11-10 (dashboard): service `palletscanner-ebay-api` (Docker, Free, Oregon) deploys `main` with Auto-Deploy On Commit; `EBAY_ENVIRONMENT=sandbox`; `PALLETSCANNER_ALLOWED_ORIGIN` unset; 16 env variables present including `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME`, `EBAY_MERCHANT_LOCATION_KEY`, the three policy IDs, and `EBAY_TOKEN_ENCRYPTION_KEY`. Whether the client ID/secret are the SANDBOX keyset is UNVERIFIED — identifiable by the owner from the `-SBX-` marker in the client ID (see runbook pre-flight).
- Token store VERIFIED 2026-11-11 (code read, `server/ebay-token-store.mjs`): tokens are encrypted at rest with AES-256-GCM (SHA-256-derived key from `EBAY_TOKEN_ENCRYPTION_KEY`, per-save random IV + auth tag) whenever the key is set — it is set on the Render service. Without the key, non-production saves fall back to plaintext; production refuses to run without it. Caveat for the gap list: Render's filesystem is ephemeral, so stored tokens do not survive redeploys/restarts — expect to re-authorize after deploys; production will need durable token storage. A legacy plaintext token file path exists for the `local` user only; the store's own saves are encrypted when the key is set.
- Order/return observation is read-only: `server/ebay-read-service.mjs` returns `observeOnly: true` data; the web imports observed orders/returns via `apps/web/src/marketplace-observation-repository.js`.
- The return lifecycle contract is validated by `npm run return:lifecycle-check` (`docs/return-lifecycle-validation.md`), but eBay post-order return search/decision methods **are not supported in eBay Sandbox** — the return leg uses manual return intake + the local DB lifecycle, not eBay decision APIs. That limitation is part of the acceptance criteria.
- Dependencies from the original proposal are now met: PF-SCOPE-002 merged (PR #4, device pass 9/9), PF-SCOPE-003 merged (successor PR #19), PF-SCOPE-007 decided and merged (PR #22) — the proof runs against settled environment defaults, including the explicit-`EBAY_ENVIRONMENT` rule.

## Included

- One real item, end to end, sandbox only: mobile capture → draft → save → web decision (floor/approved price) → sandbox listing create → sandbox listing visible in the sandbox seller account → observed sandbox order imported → reservation/quantity reconciliation → listing end/quantity update → manual return intake → inspection/disposition → financial outcome recorded. Each hop asserts the shared row/state both surfaces see.
- A repeatable sandbox proof runbook (`project-control/PF-SCOPE-004-runbook.md`) so the proof can be re-run, not a one-off demo.
- Failure handling: sandbox listing failure, order-import mismatch, and return identity mismatch must each leave inventory quarantined/unavailable with a visible error — never silently sellable.
- Read-only verification of the Render deployment configuration (DONE 2026-11-10, recorded above). No deployment changes.

## Excluded

- Production eBay calls of any kind; real money, real buyers, real refunds, real shipping/messages. No production credentials in the proof.
- New marketplaces; Facebook changes; AI reactivation; pricing-policy changes; new views or redesigns; migration edits (unless a proven bug forces a separately approved fix — stop and ask first).
- Production deployment changes; hosted Supabase writes beyond the proof item's own records created through the apps' normal flows.

## Dependencies

- From Colton, before implementation: (1) confirm the Render `EBAY_CLIENT_ID` is the sandbox keyset (contains `-SBX-`), or supply the sandbox app credentials (client ID/secret, RuName, merchant location key, payment/return/fulfillment policy IDs) plus a sandbox seller account through secure storage — never in chat. `docs/ebay-integration-guide.md` describes the sandbox app/account setup. (2) Sign in once as the sandbox seller to authorize the app when the connect flow asks (browser sign-in at `auth.sandbox.ebay.com`). (3) Separate explicit go-ahead for sandbox eBay calls (live marketplace actions require separate approval every time per `AGENTS.md`, even in sandbox).

## Risks and protected operations

- Sandbox behaviour differs from production (notably return decisions). The scope records sandbox-vs-production gaps explicitly; a sandbox pass is not a production readiness claim.
- Sandbox credentials are still credentials: server-side/env only, never in Git, reports, or screenshots.
- Rate limits: the server enforces a listing rate limit (`PALLETSCANNER_LISTING_RATE_LIMIT_PER_MINUTE`, default 20).

## Acceptance criteria

- [x] One real item completes capture → draft → save → web decision → sandbox listing → observed order → reconciliation → listing end → manual return → disposition, with the shared inventory row asserted at each hop on both surfaces. (Listing end was resolved by the sale itself; see Completion record.)
- [x] A sandbox listing failure, an order-import mismatch, and a return identity mismatch each leave stock quarantined/unavailable with a visible error and an audit trail. (All three drills run 2026-11-21; Drill 1 carries one finding — the publish failure is not persisted on the item; see gap 19 in the runbook.)
- [x] The proof is re-runnable from the runbook, with no production call made (environment assertion recorded: `EBAY_ENVIRONMENT=sandbox` on the live service + sandbox base URLs in the server log/config).
- [x] Sandbox-vs-production gaps are documented, including the eBay Sandbox return-decision limitation, the ephemeral token-storage caveat, and what production proof would still require (controlled seller account, per `docs/return-lifecycle-validation.md`). The finalized 21-item list lives in the runbook (`PF-SCOPE-004-runbook.md`, "Sandbox-vs-production gap list (final, 2026-11-21)") — that is its canonical home.
- [x] `npm run check` exits 0; no migration edits; no secrets in the diff. (Root check green on the fix and docs merges that carried this proof: PR #32, PR #36, and the closeout docs PR.)

## Verification

- Commands: `npm run check`; the sandbox proof runbook executed end to end with evidence (sandbox listing ID, order import record, return case record — IDs only, no credential values).
- Manual: the capture hop on a real iPhone; the web decision hop in a desktop browser; the sandbox seller sign-in/consent by the owner.

## Completion record (2026-11-21)

### Main path — the full sandbox circle

- **Proof item:** "Barcode item 048500207000" (app item code PF-1794091338070, eBay SKU `pallet-1794091338070`).
- **Publish (2026-11-12):** listing **110591567038** created through the app and verified live in the sandbox seller account at **US $205.00** (the owner set the eBay platform price deliberately; the item's general listing price stays $20). Publishing first required the image re-hosting fix (PR #31, merged as `e5d06544`): hosted reads return signed URLs, which eBay cannot use as listing images.
- **Purchase (2026-11-13):** sandbox buyer order **00-29002-95681**, total **$214.94** ($205.00 + $9.94 tax, free shipping). The sale ended the listing — the "listing end" hop is satisfied by the sale itself.
- **Import (2026-11-20):** the eBay offers-list call (400, error 25707) had been sinking the preview's fan-out; PR #32 (merged as `1de675ec`) made each preview resource settle independently. The order then imported cleanly: PAID, preflight Ready, lines needing match 0.
- **Reservation / fulfillment / delivery (2026-11-20):** reservation recorded; fulfillment walked to SHIPPED (synthetic tracking, label cost $0.00); inventory consumed at carrier handoff; delivery recorded by the owner. Order PAID/DELIVERED.
- **Return leg (completed by Colton 2026-11-21 08:38 MST; verified read-only 08:42 MST):** manual return (the sandbox has no post-order return decision APIs — by design), disposition **restock**, refund **$205.00** recorded, return **CLOSED** ("Closed · inventory dispositioned · financial recorded"). Item back to ON HAND 1 / RESERVED 0 / AVAILABLE 1. Data: RETURN IMPACT −$205, **ESTIMATED PROFIT $0**. Fees stay in the pending state: eBay Sandbox exposes no seller fee records anywhere, so no fee figure exists to record — the profit figure is provisional for that reason alone.

### Failure drills (all run 2026-11-21)

- **Drill 2 — order-import mismatch: PASSED (fallback staging).** The primary staging (a direct sandbox listing with an unknown SKU) proved impossible: the sandbox listing UI is broken (gap 17). Fallback, as designed: a fresh item ("PF-SCOPE-004 Drill 2 fallback unit") was published through the app (listing **110591619103**, $5.00), bought as the sandbox buyer (order **00-39330-11969**, **$5.33 PAID** — $5.00 + $0.33 WA tax on the dummy Seattle address), and the local item was **archived before the first preview/import**. Evidence: preview showed the order line unmatched (audit snapshot saved); after import, Orders read LINES NEEDING MATCH 1; Inspect showed the line unmatched, Available —, Preflight "Match required", **Reserve inventory disabled**; the Match-item dialog negative control (open → Cancel) changed nothing; the proof item stayed 1/0/1.
- **Drill 3 — return identity mismatch: PASSED.** Rode order 00-39330-11969: the line was matched to a fresh unit ("PF-SCOPE-004 Drill 3 return unit"), then fulfilled locally end to end (reserve → pick → pack → label → carrier handoff → delivery; item consumed 0/0/0). A manual return was received and inspected **without evidence first**: the save was refused and nothing was recorded — the evidence gate held (the refusal message is the generic one; gap 20). With serial evidence uploaded (a placard photo of the wrong serial), the same inspection recorded: return header **exception**, badge **"Identity mismatch · quarantine locked"**, no "Choose disposition" offered, item held ON HAND 1 / RESERVED 1 / AVAILABLE 0. Cleanup: Resolve identity discrepancy → **wrong_item_nonstock** → Choose disposition → **supplier_return** (item 0/0/0) → return closed with financial outcome not-applicable. The wrong unit never entered sellable stock.
- **Drill 1 — listing failure: PASSED WITH FINDING.** A fresh item priced $0.01/$0.01/$0.01 was posted once. eBay rejected it: "The Auto decline amount cannot be greater than or equal to the Buy It Now price. value is invalid." No listing ID was assigned; stock untouched (ON HAND 1 / AVAILABLE 1). **Finding:** after a refresh, the failure had vanished — the Marketplace panel looked exactly as before the attempt and the item did **not** appear in Review → Publishing issues. The web publish failure is transient-only: no `ebayStatus: "error"` / `ebayLastError` is persisted (gap 19). The fix is PF-SCOPE-029 (APPROVED 2026-11-21, queued after PF-SCOPE-024/025). Drill item archived.

### Sandbox-vs-production gaps

Finalized 21-item list: see the runbook, "Sandbox-vs-production gap list (final, 2026-11-21)". Headlines: the ephemeral token store (→ PF-SCOPE-024), the Settings status-fetch timeout (→ PF-SCOPE-025), the unpublished publish failure (→ PF-SCOPE-029), the Orders UI never showing the real eBay order total, and the sandbox's missing fee records and broken direct-listing UI.

## Prep record (2026-11-11)

- Token-store encryption check: DONE (see Current evidence).
- Render configuration check: DONE 2026-11-10 (see Current evidence).
- Runbook drafted: `project-control/PF-SCOPE-004-runbook.md`.
- Remaining before implementation: the three owner items in Dependencies.
