# PF-SCOPE-011 — Clients create the acquisition for each new pallet
Status: IN_PROGRESS
Owner approval: APPROVED 2026-11-07 (owner chose the app-side fix over a database bridge trigger on long-term grounds, after PF-SCOPE-010 Stage C exposed the gap)
Branch: scope/PF-SCOPE-011-acquisition-creation
Base: main 1747afb1 (PF-SCOPE-002 merged, CI green)
Lifecycle: PROPOSED → APPROVED → IN_PROGRESS → VERIFIED → OWNER_REVIEW → CLOSED
Related decisions: PF-D-003 (high autonomy inside a bounded approved scope), PF-D-012 (sourcing deferred — acquisitions are its future surface; this scope only creates the rows the current schema already requires). Follows PF-SCOPE-010 (hosted schema alignment), whose Stage C verification found this gap.

## Objective

Items saved under a newly created pallet fail to reach the cloud: `inventory_items.acquisition_id` is NOT NULL with a foreign key to `acquisitions`, the 202610100001 backfill created one acquisition per pre-existing pallet, and neither client ever creates one for a new pallet — the item insert fails with FK violation 23503 (PostgREST 409). `scripts/check-live-db.mjs` documents the contract ("a brand-new pallet has no acquisitions row, so the parent row must be created first") and CI honours it manually, which is why CI never caught the app-side gap. Make both clients create the acquisition when they create a pallet, following the backfill convention (acquisition id = pallet id, so the existing `inventory_items_assign_authority` trigger default `acquisition_id := pallet_id` resolves for the clients' current item payloads).

## Included

- Web (`apps/web/src/supabase-inventory-repository.js`): `createPallet` inserts the matching acquisition (id and legacy_pallet_id = the new pallet's server id, business_id and owner from the created pallet, type `pallet`, name, purchase_price = purchase_cost) immediately after the pallet insert. `updatePallet` mirrors name/purchase_cost changes onto the acquisition so the pair cannot drift.
- Mobile (`apps/mobile/lib/cloud-inventory-sync.ts`): when pushing changed pallets, upsert the matching acquisition for each non-system pallet (onConflict `id`) before items are pushed. System pallets are skipped — the Loose Items acquisition is database-managed and its assert trigger restricts client writes.
- CI (`scripts/check-live-db.mjs`): new section pinning the client contract — insert a pallet, insert its acquisition with id = pallet id, then upsert an item in the clients' exact shape (no `acquisition_id` or `business_id` sent; trigger defaults apply) and assert success.
- Web self-test probe (`apps/web/src/App.jsx`, `testCloud`): the throwaway item now uses quantity 0. Found during verification (2026-11-07): with quantity 1 the item receives an opening ledger movement, items with movements are intentionally not hard-deletable, and the cleanup's pallet delete fails with FK 23503 from `inventory_movements` — the self-test could never pass against the ledger schema. A zero-quantity probe exercises the same create/update/save/archive/delete round trip without creating ledger history; CI covers the stocked-item ledger path. (Separate product finding, NOT in this scope: deleting a pallet that holds — or ever held — stocked items cannot succeed in either app; the pallet-delete behaviour for stocked pallets needs its own owner decision.)

## Excluded

- No schema changes, no new migrations, no database bridge trigger (considered and rejected by the owner, 2026-11-07).
- No acquisition editing UI or sourcing features; acquisition rows are created with pallet-mirrored fields only.
- Pallet deletion is unchanged: an acquisition outlives its pallet as ledger history (there is deliberately no FK from `acquisitions.legacy_pallet_id` to `pallets`). The web self-test therefore leaves one historical acquisition row per run — accepted.

## Acceptance criteria

- [ ] CI green on the branch, including the new check-live-db contract section.
- [ ] Web (owner, on this branch): Settings → "Test cloud connection" passes end to end (create pallet → update → save item → cleanup).
- [ ] Mobile (owner, on this branch): create a new pallet on the phone, save an item under it, and the item appears in the web cloud Inventory. (Also completes PF-SCOPE-010 Stage C check 2 together with the Loose Items sync check.)

## Completion record

(Pending — filled in at verification.)
