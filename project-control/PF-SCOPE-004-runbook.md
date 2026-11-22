# PF-SCOPE-004 — Sandbox proof runbook (FINAL, 2026-11-21)

Status: COMPLETE — the proof run and all three failure drills were executed 2026-11-12 → 2026-11-21 and PF-SCOPE-004 is CLOSED. This runbook remains the re-run procedure; the completion record and drill outcomes live in `PF-SCOPE-004-ebay-sandbox-proof.md`. A re-run needs a fresh owner sandbox-call go-ahead (pre-flight step 5).

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

_Run 2026-11-21 — all three passed; Drill 1 with a finding. Outcomes: `PF-SCOPE-004-ebay-sandbox-proof.md`, Completion record._

- **Listing failure:** force a create failure (e.g., remove a required field/policy in a throwaway draft). Expect: visible error, item not listed, stock unavailable for other channels, audit event present.
- **Order-import mismatch:** import an observation that does not match local state (wrong quantity or unknown listing). Expect: mismatch flagged, no silent quantity change, item/order quarantined with a visible error.
- **Return identity mismatch:** start a return against the wrong item/order identity. Expect: refusal with a visible error and an audit trail; the real item's state untouched.

## Evidence to capture

- Sandbox listing ID, sandbox order ID, return case ID (IDs only).
- The environment assertion (step 1–3 results, dated).
- Per-hop assertion outcomes (pass/fail + where a failure stopped the run).
- `npm run check` result on the proof branch.

## Sandbox-vs-production gap list (final, 2026-11-21)

The canonical gap list for PF-SCOPE-004, finalized at closeout from the proof run and the three failure drills. (The scope doc points here; do not duplicate the list elsewhere.)

1. **Token storage durability:** the eBay token store is an encrypted file on the Render service's ephemeral disk; a reconnect is needed after redeploys **and apparent restarts** (the token was wiped three times on 2026-11-21 alone, once by a docs-only merge's redeploy). → PF-SCOPE-024 (durable token store). **RESOLVED 2026-11-21 by PF-SCOPE-024 (CLOSED):** the encrypted envelope now lives in `public.ebay_connections` under owner-only RLS (file store kept as the local fallback). Acceptance proof PASSED 2026-11-21: cutover completed (hosted migration applied, Render SUPABASE_ANON_KEY set, seller reconnected — "Ready to list" 6/6 green), then PR #39 merged to main, Render redeployed, and the status re-check still read "Ready to list" with NO reconnect.
2. **Signed-URL listing images:** hosted photo reads return signed URLs (~1-hour expiry), unusable as eBay listing images. Closed by PR #31 (server-side media re-hosting).
3. **Settings status fetch has no timeout:** one hung status fetch against the sleeping backend wedges the whole Settings eBay card on "Checking…" until a page refresh. → PF-SCOPE-025.
4. **Stale OAuth state:** after a delay or a backend sleep, the connect flow can fail on a stale OAuth state token; retrying the connect succeeds.
5. **Sandbox API holes:** the eBay offers-list call fails 400 / error 25707 on this sandbox account while inventory and orders succeed (the app degrades gracefully since PR #32); post-order return search returns "Bad scheme: Bearer" — **eBay Sandbox does not support return search/decision APIs**, so the return leg is manual intake + the local lifecycle by design. Production proof must exercise the real decision APIs.
6. **Order totals never surface:** the Orders UI never displays the real eBay order total — the proof order's detail showed $70 against a $205 sale / $214.94 eBay total; the Drill 2 order shows Total $0.00 / Paid $0.00 against $5.33; the preview shows no order number, total, or payment status at all.
7. **Match disagreement:** for the same SKU, the preview's inventory-record match and the order-line match disagree.
8. **Overview vs Data disagreement:** Overview showed SOLD ITEMS 0 / $0 revenue while Data showed 1 recorded sale / $205.
9. **Item record doesn't reflect the sale:** the item's Sale tab never links automated (eBay) sales, and the item's workflow status stays "Captured" after it sells out.
10. **Package dimensions don't read back:** entered dimensions are not displayed on read-back (the Inspect view shows only "confirmed" + the final weight in grams); in the main proof, 8×6×4 in was entered and 13×9×4 came back — unexplained.
11. **Orders default filter:** the "Needs attention" default filter hides a PAID order that is simply awaiting fulfillment.
12. **No sandbox fee records:** eBay Sandbox exposes no seller fee records anywhere (no final-value fee, invoice, or payout figure), so fees stay pending and profit stays provisional. Production proof must capture real fees.
13. **Transient stale reads:** before a manual refresh, some surfaces show stale state (the Returns tab can read "No returns recorded" / $0; item History tiles lag the ledger until a reload). The ledger itself is always correct; the tiles catch up on reload.
14. **Resolved-returns counter:** the RESOLVED RETURNS counter misses the `closed` terminal status — it read 1 while a return sat at the resolved stage and 0 after that return closed, with two closed returns on record.
15. **Proceeds vs profit:** NET PROCEEDS shows $205 (gross of returns) while ESTIMATED PROFIT shows $0 on the same data.
16. **Mobile barcode lookup vs sleeping backend:** the mobile lookup asked the Render backend first and only, so a sleeping backend timed scans out. Fixed by PF-SCOPE-026 (6-second leash, fall through to the direct sources).
17. **Sandbox direct-listing UI is broken:** creating a listing directly in the sandbox eBay UI is not viable — the return-policy "Accept returns" toggles are disabled and publishing is refused, there is no Custom label/SKU field anywhere in the form, and Seller Hub overview / business-policies pages return error pages. Drill 2's primary staging was impossible for this reason; the app-publish fallback was used.
18. **One saved login per site:** the Secure Vault holds a single login per site, so the sandbox buyer account has no saved credential (the seller's occupies the ebay.com slot). The drill purchase was completed in the owner's own Chrome, where the buyer session lives.
19. **Publish failures are not persisted:** a failed web publish shows its error only in the moment; nothing is saved on the item (no `ebayStatus: "error"`, no `ebayLastError`), and after a refresh the item looks untouched and never appears in Review → Publishing issues (Drill 1 finding). → PF-SCOPE-029. **RESOLVED 2026-11-21 by PF-SCOPE-029 (CLOSED):** failures now persist `ebayStatus: "error"` + `ebayLastError`, surface in Publishing issues with the message, and clear on the next successful publish — proven live on the deployed app (error survived a reload; floor fix → successful publish → cleared, Publishing issues back to 0).
20. **Mismatch-gate message is generic:** the identity-mismatch evidence gate works — an inspection without evidence is refused and nothing is recorded — but the refusal surfaces the generic "Could not update the return." instead of the specific evidence-required message (Drill 3 finding).
21. **Minor:** the resolve-identity form silently no-ops when submitted without an explanation; a delivered order's Inspect view drops the order-lines table; a $0.01 price is stored as the float 0.00999… and displays as $0.
22. **No "End listing" action in the web app:** an item with a live eBay listing cannot be delisted from PalletFlip, and archiving the item does not end its listing — observed 2026-11-21 in the PF-SCOPE-029 acceptance: the archived test item's sandbox listing 110591620696 remains live on eBay's side. Harmless in the sandbox; in production an archived-but-still-listed item could sell with no inventory behind it. → PF-SCOPE-030 (APPROVED 2026-11-21): the web Marketplace panel gains an "End listing" action on the existing backend endpoint (mobile already had one), and the archive confirmation warns when a live listing exists. Built 2026-11-21; the fix's own live acceptance — ending listing 110591620696 from the deployed web UI — runs post-merge and closes this gap.

Carried from the original seed list (still true, not re-tested at closeout):

- **Credential separation:** the sandbox keyset is identified by the `-SBX-` marker and the server rejects it in production mode; production needs its own keyset + its own authorization, separately approved.
- **Policies/locations:** sandbox policies and the merchant location are test constructs; production requires the real seller account's policies and location to be created and verified.
