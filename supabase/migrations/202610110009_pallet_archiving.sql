-- PF-SCOPE-014: pallets archive like items. App-side pallet removal becomes
-- an archive (archived_at) instead of a hard delete, which the append-only
-- inventory_movements ledger makes impossible for any pallet that ever held
-- stocked items (the pallet delete cascades to its items and fails on the
-- movement foreign keys). Archived pallets leave every active view in both
-- apps; the rows (and their history) stay restorable.
alter table public.pallets
  add column if not exists archived_at timestamptz;
