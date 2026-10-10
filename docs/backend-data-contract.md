# Backend Data Contract

The backend schema begins in
`supabase/migrations/202609110001_initial_inventory.sql`. Later changes are
separate, ordered files in the same directory so an existing remote project can
be upgraded without recreating its tables.

`202609120001_add_inventory_category.sql` adds the normalized item category used
for category sell-through and profitability analysis. Sale outcomes remain in
the dedicated `sales` table so marketplace, fees, shipping, and sale dates are
not inferred from inventory fields.

## Ownership

The first production version has one owner but introduces a hidden business
boundary. Every operational row carries `business_id` and the authenticated
Supabase user ID as `owner_id`; row-level security restricts reads and writes to
that owner. Membership rows preserve a clean path to multiple users per account
without adding team-management UI at launch.

## Inventory Authority

`inventory_movements` is the immutable explanation for on-hand quantity, and
`inventory_reservations` explains committed and short inventory. The
`inventory_items` balance columns are caches for efficient screens, not an
independent source of truth.

Compatibility clients may still write `inventory_items.quantity` while mobile
and web migrate to explicit movement commands. Database triggers translate each
insert or quantity delta into a receipt or correction movement and refresh the
cached balances. Repeated upserts with an unchanged quantity do not create a
movement. Reservation changes also refresh available and shortage balances.
The web workhorse requires a reason for a manual available-quantity adjustment;
the compatibility row carries that reason into the resulting correction
movement. Automated mobile synchronization supplies its own source reason.

Normal clients may append movements but cannot update or delete movement
history through row-level-security policies.

Normal item removal is an archive operation. It sets
`inventory_items.archived_at`, excludes the record from active mobile sync and
day-to-day dashboard totals, and preserves photos, sales, listings, and movement
history. The web inventory filter can reveal and restore archived records.

Storage location is an optional free-text inventory field. Location tracking is
off by default so a hobbyist can ignore it; when enabled in web settings, the
item editor accepts practical labels such as `Garage / Rack 2` without imposing
a warehouse hierarchy.

Every inventory card receives a stable PalletFlip SKU such as `PF-12345` when
automatic SKU generation is enabled. This internal stock identity works without
a marketplace account and remains separate from eBay listing and offer IDs.

Each sale records the number of units sold. Its database trigger locks the
inventory row, rejects a quantity above the current available balance, and
appends an idempotent negative `sale` movement. Partial sales leave the
inventory card active; the client marks it sold only after the last available
unit is consumed.

Reservations are created through an authenticated database command that locks
the inventory row, allocates no more than the available balance, records any
unfilled demand as shortage, and returns the original reservation when an
idempotency key is retried. Releasing a reservation restores availability while
preserving the reservation record and audit timestamps.

## Local-to-Server IDs

Current mobile data uses numeric item IDs and string pallet IDs. The server uses
UUID primary keys and preserves those values as `client_id`:

- `PalletSession.id` maps to `pallets.client_id`.
- `InventoryItem.id` maps to `inventory_items.client_id`.
- `InventoryItem.barcode` maps to `inventory_items.product_barcode`.
- Related server tables use the UUID primary keys.

This allows existing local inventory to upload without changing identifiers in
the mobile UI. The unique `(owner_id, client_id)` constraints make imports
idempotent for one account.

## Photos

Photo objects use the private `item-photos` bucket. Paths must start with the
authenticated user ID, for example:

```text
USER_ID/ITEM_UUID/PHOTO_UUID.jpg
```

The `item_photos` table stores ordering and object paths. Clients should request
short-lived signed URLs for display and never persist signed URLs as item data.

## Marketplace Safety

Marketplace secrets and token refresh remain server-only. Mobile and web may
edit listing drafts and status, but eBay publication still goes through the
protected backend. Mobile publication is allowed after the final readiness
confirmation; there is no separate web approval state.

## Adapter Mapping

The future Supabase repository adapter will implement the existing
`InventoryRepository` contract:

- `hydrate` loads pallets and items for `auth.uid()`.
- `saveItem` upserts by `(owner_id, client_id)` and resolves the pallet UUID.
- `removeItem` deletes by `(owner_id, client_id)`; photo rows cascade.
- pallet writes upsert by `(owner_id, client_id)`.
- listing, sale, and activity operations use their dedicated tables.
- photo upload writes the private object first, then its `item_photos` row.

Local adapters remain useful for offline drafts and previews after the remote
adapter exists.
