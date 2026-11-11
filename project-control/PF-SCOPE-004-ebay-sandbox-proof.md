# PF-SCOPE-004 — End-to-end eBay sandbox proof

Status: IN_PROGRESS (prep started 2026-11-11; implementation waits on two owner items: sandbox credential confirmation and the explicit sandbox-call go-ahead — see Dependencies)
Owner approval: APPROVED 2026-11-04 (all four scopes 004–007 approved by Colton)
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

- [ ] One real item completes capture → draft → save → web decision → sandbox listing → observed order → reconciliation → listing end → manual return → disposition, with the shared inventory row asserted at each hop on both surfaces.
- [ ] A sandbox listing failure, an order-import mismatch, and a return identity mismatch each leave stock quarantined/unavailable with a visible error and an audit trail.
- [ ] The proof is re-runnable from the runbook, with no production call made (environment assertion recorded: `EBAY_ENVIRONMENT=sandbox` on the live service + sandbox base URLs in the server log/config).
- [ ] Sandbox-vs-production gaps are documented, including the eBay Sandbox return-decision limitation, the ephemeral token-storage caveat, and what production proof would still require (controlled seller account, per `docs/return-lifecycle-validation.md`).
- [ ] `npm run check` exits 0; no migration edits; no secrets in the diff.

## Verification

- Commands: `npm run check`; the sandbox proof runbook executed end to end with evidence (sandbox listing ID, order import record, return case record — IDs only, no credential values).
- Manual: the capture hop on a real iPhone; the web decision hop in a desktop browser; the sandbox seller sign-in/consent by the owner.

## Prep record (2026-11-11)

- Token-store encryption check: DONE (see Current evidence).
- Render configuration check: DONE 2026-11-10 (see Current evidence).
- Runbook drafted: `project-control/PF-SCOPE-004-runbook.md`.
- Remaining before implementation: the three owner items in Dependencies.
