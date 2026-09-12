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

The first production version is user-owned. Every business row carries the
authenticated Supabase user ID as `owner_id`, and row-level security restricts
reads and writes to that owner. This fits the current one-seller-per-login app
without preventing an organization/team migration later.

## Local-to-Server IDs

Current mobile data uses numeric item IDs and string pallet IDs. The server uses
UUID primary keys and preserves those values as `client_id`:

- `PalletSession.id` maps to `pallets.client_id`.
- `InventoryItem.id` maps to `inventory_items.client_id`.
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
