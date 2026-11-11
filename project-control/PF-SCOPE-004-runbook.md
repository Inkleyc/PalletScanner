# PF-SCOPE-004 — Sandbox proof runbook (DRAFT, 2026-11-11)

Re-runnable end-to-end proof for PF-SCOPE-004. Sandbox only. Record evidence as IDs and timestamps only — never credential values, never token contents.

## Pre-flight (all must hold before the first sandbox call)

1. **Environment assertion.** Render dashboard → `palletscanner-ebay-api` → Environment: `EBAY_ENVIRONMENT` = `sandbox` (verified 2026-11-10; re-confirm if the service was edited since). The live service answers at https://palletscanner-ebay-api.onrender.com — `GET /health` returns OK.
2. **Keyset assertion (owner).** In the Render Environment page, reveal `EBAY_CLIENT_ID` and confirm it contains `-SBX-` (eBay's sandbox marker; the server code itself uses this marker to reject sandbox credentials in production mode). If it does not, stop: the sandbox keyset must be installed first (owner supplies via secure storage; values go directly into Render env, never through chat or Git).
3. **Encryption assertion.** `EBAY_TOKEN_ENCRYPTION_KEY` exists in the same env list (verified 2026-11-10 by name). Tokens saved by the server are then AES-256-GCM encrypted at rest (`server/ebay-token-store.mjs`).
4. **Seller account.** A sandbox test user (seller) exists in the eBay developer portal, with business policies and an inventory location (per `docs/ebay-integration-guide.md`). The owner signs in as this user in step 6.
5. **Owner go-ahead.** The explicit sandbox-call go-ahead for this run is recorded in the PalletFlip chat before step 6. Sandbox calls are a protected operation; a new run needs a new go-ahead.
6. **Connect / authorize.** From the app (web Admin Settings or mobile Settings) start the eBay connect flow → browser opens `auth.sandbox.ebay.com` → owner signs in as the sandbox seller and consents → callback stores the token server-side. Confirm the app's eBay status reads ready to list. Note: Render's disk is ephemeral — if the service redeployed or restarted since the last authorization, the token is gone and this step repeats. That is expected in sandbox; it is a documented production gap, not a failure of the proof.

## The proof run (one real item)

Use one real, low-value item the owner is willing to list in sandbox. Name it with a `PF-SCOPE-004` marker in the working notes (the item itself keeps its real name in the apps).

| Hop | Action | Assert (both surfaces) |
| --- | --- | --- |
| 1. Capture | Owner captures the item on the iPhone (photo + barcode/manual) | Draft appears with photos; save succeeds |
| 2. Save | Save the item | Same row (id) visible in web Inventory, same fields |
| 3. Decision | In web Review, set floor + approved listing price (003 path) | Mobile shows the same prices/status after sync |
| 4. List | Create the sandbox listing from the app | Listing job succeeds; record the sandbox listing ID; listing visible in the sandbox seller account |
| 5. Order | Create/observe a sandbox order for the listing (sandbox buyer flow or the read-service observation) | Order imports via the observation path (`observeOnly` data); record the order ID |
| 6. Reconcile | Run order import → reservation/quantity reconciliation | Quantity/reservation matches the order on both surfaces; financials update |
| 7. End listing | End the sandbox listing / quantity update | Listing state ended in sandbox and in the app; stock state consistent |
| 8. Return | Manual return intake for the item (sandbox has no return-decision APIs) | Return case created; item routes to inspection |
| 9. Disposition | Complete inspection/disposition | Financial outcome recorded; inventory state final and identical on mobile + web |

## Failure drills (each must quarantine, never silently sellable)

- **Listing failure:** force a create failure (e.g., remove a required field/policy in a throwaway draft). Expect: visible error, item not listed, stock unavailable for other channels, audit event present.
- **Order-import mismatch:** import an observation that does not match local state (wrong quantity or unknown listing). Expect: mismatch flagged, no silent quantity change, item/order quarantined with a visible error.
- **Return identity mismatch:** start a return against the wrong item/order identity. Expect: refusal with a visible error and an audit trail; the real item's state untouched.

## Evidence to capture

- Sandbox listing ID, sandbox order ID, return case ID (IDs only).
- The environment assertion (step 1–3 results, dated).
- Per-hop assertion outcomes (pass/fail + where a failure stopped the run).
- `npm run check` result on the proof branch.

## Sandbox-vs-production gap list (seed — extend during the run)

1. **Return decisions:** eBay Sandbox does not support post-order return search/decision APIs; the return leg is manual intake + local lifecycle. Production proof must exercise the real decision APIs.
2. **Token storage durability:** tokens live on the Render service's ephemeral disk; they vanish on redeploy/restart. Production needs durable, encrypted token storage before real selling.
3. **Credential separation:** the sandbox keyset is identified by the `-SBX-` marker and the server rejects it in production mode; production needs its own keyset + its own authorization, separately approved.
4. **Policies/locations:** sandbox policies and the merchant location are test constructs; production requires the real seller account's policies and location to be created and verified.
5. _(Add gaps as the run finds them — sandbox category behaviour, media API differences, and order simulation limits are expected candidates.)_
