# PF-SCOPE-014 — Pallets archive like items (no more hard-delete dead end)
Status: IN_PROGRESS
Owner approval: APPROVED 2026-11-07 (owner chose the archive model in the design discussion: "Do it"; recorded as PF-D-014)
Decision authority: PF-D-003 (autonomy inside an approved scope); PF-D-008 respected — applying the new migration to the HOSTED database is a separate, explicitly-gated step after CI (same pattern as PF-SCOPE-010 Stage B).

## Problem (found during PF-SCOPE-010/011 verification, 2026-11-07)

Removal semantics are inconsistent and pallet removal is a dead end:

- Items archive: both apps set `archived_at` (they must — stocked items carry append-only `inventory_movements` rows whose foreign keys make hard deletion fail with 23503).
- Pallets hard-delete: neither app archives them and the table has no `archived_at`. Deleting a pallet cascade-deletes its items, so removing a pallet that holds — or ever held — a stocked item **always fails** in both apps. Three self-test pallets in the hosted database are stuck exactly this way, and the mobile sync's pallet-deletion propagation (`pallets.delete()`) fails silently for stocked pallets.
- The web self-test's cleanup hits the same wall (its stocked probe pallet could not be removed until the probe was made quantity-0 in PF-SCOPE-011).

## Decision (PF-D-014)

Items and pallets share one removal model: **archive, never hard-delete from the apps.** Archived rows stay in the database (ledger and history intact, restorable later) and leave every active view. An Archived view with restore is the approved follow-up direction but is a separate future scope, NOT part of this one.

## Included

- **Migration `202610110009_pallet_archiving.sql`:** `pallets.archived_at` (timestamptz, nullable). No other schema change; no RLS change (existing owner policies cover the column).
- **Web cloud repository:** hydrate loads only unarchived pallets; `removePallet` archives the pallet's unarchived items, then the pallet (activity event `pallet.archived`); Loose Items guard unchanged. State contract unchanged (state.pallets = active pallets).
- **Web local repository:** parity — `removePallet` archives the pallet and its items instead of splicing them away; snapshots publish only active pallets (mirroring the cloud contract); `archivedAt` normalized on pallets.
- **Activity labels:** `pallet.archived` → "Pallet archived" (the historical `pallet.deleted` label stays for old entries).
- **Mobile:** local pallet deletion stays a local removal (same as items); cloud sync now propagates it as an archive — the deleted-pallets branch updates `archived_at` instead of deleting, the remote-pallet scan and the snapshot pull only consider unarchived pallets, so an archived pallet (from either app) leaves the phone on the next sync instead of resurrecting or erroring.
- **CI:** `scripts/check-live-db.mjs` gains a PF-SCOPE-014 section: a stocked pallet is archived via the client-shaped updates; the rows persist, the ledger movements are untouched, and the pallet leaves the active (unarchived) view.

## Explicitly excluded

- No Archived view and no restore UI (future scope, per PF-D-014).
- No change to item archiving (already the model), no acquisition changes (acquisitions remain ledger history), no hosted-data cleanup (the stuck self-test pallets become removable through the app once this ships and the migration is applied to the hosted database).
- Known accepted edge: a cross-device race (phone pushes items under a pallet the web just archived) can leave active items under an archived pallet until the phone's next pull; the web archives a pallet's items with it, so the window is one sync cycle.

## Acceptance checks

- [ ] CI green on the branch, including the new check-live-db section and the migration replay (68 migrations).
- [ ] Local: mobile typecheck + lint clean; web build passes.
- [ ] Owner, after the hosted migration is applied (separate go-ahead): in the web app, remove one of the stuck "Temporary cloud self-test" pallets — it succeeds and the pallet disappears; on the phone, delete a stocked pallet and confirm it leaves the web view after sync.

## Completion record

(Pending — filled in at verification.)
