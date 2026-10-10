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
Ledger balance refreshes update the legacy `quantity` cache behind a
transaction-local guard, preventing that internal cache write from creating a
second movement. This keeps older clients compatible after imported inventory
is physically verified.
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
The web item History panel exposes the same contract as a lightweight manual
hold workflow so reservations and shortages can be exercised before automated
marketplace orders are enabled.

Imported orders preserve eBay's cancellation state. A confirmed `CANCELED`
order can release its active inventory reservations through one atomic,
idempotent command. Cancellation-pending or cancelled orders cannot acquire new
reservations, and released reservation records remain available for audit.

Each matched eBay offer preserves both its last confirmed advertised quantity
and PalletFlip's desired quantity, calculated from ledger-backed available
inventory. Inventory changes refresh that intent immediately. Differences remain
`paused` while either the marketplace account or listing is paused, so observing
and calculating a correction cannot cause an outbound eBay write.

The owner has one account-level outbound pause. Disabling the pause moves a new
or previously paused account only into `review_required`; it does not silently
enable active synchronization. Every pause change is audited, while inbound
marketplace observation remains available.

Approving one quantity mismatch creates a durable `marketplace_action_jobs`
record rather than calling eBay from the browser. The job captures SKU, offer,
observed quantity transition, desired quantity, retry state, and a business-wide
idempotency key. Only verified inventory on an unpaused, review-approved account
can enter the queue. External execution is a separate server responsibility.

The protected server claims one due job through the signed-in Supabase session,
updates both eBay inventory-item and offer quantity, and then records success.
Failures enter bounded exponential retry waits and become persistent failed
exceptions after the maximum attempt count. A stale running claim can be safely
reclaimed because setting the same absolute eBay quantity is idempotent.

When verified available quantity reaches zero, approval creates a
`withdraw_listing` job instead of sending a zero-quantity adjustment. The
executor withdraws the specific eBay offer, marks the local listing ended only
after eBay succeeds, and records `marketplace.final_unit_withdrawn`. This final
unit rule uses the same account pause, explicit review, durable job, retry, and
audit protections as ordinary quantity synchronization.

The web exception panel keeps pending, running, retry-wait, and exhausted jobs
visible. Due retries and stale claims can be run again without creating another
job. An exhausted job requires explicit owner approval, resets its bounded
attempt counter, and preserves the prior error in append-only audit history.

## Shipping Foundation

Shipping records use grams and millimeters as stable storage units while clients
may present ounces, pounds, and inches. Optional item weight supports a packed
weight estimate using a package preset's tare weight and packing allowance.
`shipment_packages.measurement_state` keeps estimates visibly distinct from
final measurements, which must be confirmed during fulfillment before label
purchase. The model defaults to one package but supports multiple packages and
partial line allocation without a later schema change.

Launch shipment records cover pick, pack, ship-by, label handoff, tracking,
delivery, and local-pickup confirmation. Label purchase remains in eBay. The
schema reserves insurance fields, but recommendations and purchasing remain
intentionally inactive.

`start_order_fulfillment` is an explicit, idempotent transition. It accepts only
a paid, non-cancelled order whose every line has an active reservation. Shipping
orders receive one default package and line allocations; local pickup receives
no fictional package. A packed-weight estimate is created only when every line's
inventory item has a recorded weight. Otherwise the package remains incomplete
until fulfillment supplies real measurements.

Pick confirmation moves a shipping record from `ready_to_pick` to
`ready_to_pack`. Package confirmation requires positive final weight and all
three dimensions; it never promotes an estimate. Only after every package is
confirmed does the shipment become `ready_for_label`. Both transitions append
auditable activity events.

Label purchase remains an eBay or external handoff. After purchase,
`record_shipment_label` requires final package confirmation and records the
actual source, carrier, service, tracking number, and cost. It advances the
shipment to `label_purchased` and appends an audit event; it does not claim that
PalletFlip purchased or insured the shipment.

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

Marketplace observation begins in a deliberately inert state. Accounts default
to `observe_only` with outbound writes paused. Each preview can be preserved as
an import run with immutable raw observations and an explicit `matched`,
`uncertain`, `unmatched`, or `conflicting` reconciliation state. Existing
listing rows can remain unmatched until the owner approves a strong identity;
no observation table or import run authorizes a change on eBay.

Manual reconciliation choices are stored separately from immutable marketplace
observations. Each append-only decision records whether the owner matched an
existing item, requested creation of unverified inventory, ignored the record,
or deferred it. Matching an existing item requires a business-scoped inventory
UUID. Recording a decision still does not change quantity or authorize an eBay
write.

An approved `create_new` decision can create one idempotent inventory record in
the system `Loose Items` acquisition. It starts as `unverified_import` with zero
on-hand and available quantity, so marketplace-reported stock never becomes
trusted physical stock. The owner must physically verify and adjust quantity
before the item can participate in availability synchronization.
The originating eBay SKU, offer ID, listing ID, observed quantity, and raw
payload are linked to the created inventory record automatically. That listing
remains `sync_paused`; physical verification does not silently enable outbound
marketplace changes.

## Observe-Only Orders

Imported orders and order lines have stable external identifiers and preserve
their raw marketplace payloads. Reprocessing the same eBay order or line cannot
create duplicates. Each line carries an independent inventory match state, so
one unmatched SKU does not hide the rest of a multi-line order. This foundation
does not yet reserve inventory; reservation automation remains gated behind the
order-import validation phase.

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
