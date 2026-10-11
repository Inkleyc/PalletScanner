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

The seller-approved `listing_price` is stored separately from the AI-assisted
low, high, and floor estimates. Mobile and web synchronize that exact value so
a cross-device reload cannot silently replace the owner's decision with the
high estimate. Existing inventory is backfilled from its prior high estimate;
that migration source remains visible in activity history.

Every later change to the approved listing price records its previous value,
new value, and contemporaneous low/high/floor range in append-only activity.
The eBay control panel compares the last observed marketplace price with the
approved PalletFlip price and presents differences as review-only work. This
foundation never queues or executes a price change.
Offer observation copies eBay's normalized price and three-letter currency into
the reconciled listing for both matched and newly imported inventory. Existing
stored offer evidence is backfilled, and missing or invalid price evidence is
left unknown rather than guessed.
Review rows link to the exact eBay listing when an observed URL or listing ID is
available, allowing a deliberate handoff to eBay's seller tools without giving
the recommendation workflow outbound mutation authority.

The owner can resolve a current difference by keeping the PalletFlip price or
adopting the observed eBay price. Keeping the price records and suppresses only
that exact observed/approved pair; a later change on either side returns to the
queue. Adopting updates the internal approved price and its audit history. Both
decisions explicitly record that no outbound marketplace change occurred.

Optional aging recommendations are disabled by default. The owner configures a
review age from 7–365 days and a suggested markdown no greater than 50 percent.
Only active listings older than the threshold are considered, and a suggestion
can never go below the item's floor price. Recommendations are calculated for
review and cannot update the approved PalletFlip price or the marketplace.
The web item editor exposes the approved price as a separate deliberate field,
rejects a value below the floor, and still does not push that edit to eBay.
The mobile item editor enforces the same floor and explains that saving the
approved value alone does not update an already-active marketplace listing.

An owner may explicitly apply the current suggestion to PalletFlip. The server
recalculates the recommendation from the current policy, listing age, approved
price, and floor while holding the records for update; stale or client-altered
recommendations are rejected. Approval changes only the internal price, appends
audit history, and records that no outbound marketplace change occurred.

The owner may instead dismiss the exact current recommendation. The dismissal
stores the approved, suggested, and floor prices plus the policy snapshot and
reopens after one configured review interval. A changed approved price or a
newly calculated suggestion invalidates the dismissal immediately. The history
is owner-readable, append-only through a guarded command, and never changes a
marketplace listing.
Identical client retries return the current active dismissal after locking the
listing, so a network retry cannot duplicate the decision or its audit event.
Changing the recommendation policy invalidates the prior policy snapshot and
reopens the work for review.

Applying a recommendation starts the same configured review interval before
another aging markdown can appear for that listing. The timestamp is written in
the same transaction as the approval activity, preventing repeated markdowns
from being stacked immediately down to the floor.

Item History resolves both the client compatibility ID and authoritative cloud
UUID so per-item activity does not disappear when events originate in database
commands. It presents price decisions and recommendations alongside quantity
movements and reservations; the global Settings activity remains available for
account-wide review.

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

## Operational Profitability

The Analysis dashboard calculates an operational estimate from authoritative
cloud records. Gross revenue comes only from recorded `sales`. Direct selling
costs include recorded marketplace fees and seller-paid shipping. The sold
quantity receives a proportional share of its acquisition's landed cost, where
landed cost is purchase price plus inbound freight, buyer premium, and
acquisition tax. Append-only return financial events adjust the result without
erasing or rewriting the original sale.

The calculation is:

`recorded gross - fees - shipping - allocated landed cost + return impact`

Fee credits are positive return impact; refunds, return shipping, replacement
shipping, and other return costs are negative. Multi-item return impact is
allocated by returned quantity. The dashboard reports allocation coverage and
warns when a sale cannot be assigned acquisition cost, rather than treating
unknown cost as trustworthy profit.

Projected available value is reported separately using the midpoint of each
item's current low/high asking-price range. Paid eBay order subtotal is also
shown separately as observed context and is never added to profit, preventing a
recorded sale and its imported order from being counted twice. Return rate is
returned units divided by recorded sold units. The report is operational
guidance, not tax or accounting advice; general overhead, labor, mileage, and
sales tax accounting remain outside the launch calculation.

CSV and print/PDF output preserve acquisition cost recovery and item-level
profitability alongside the existing descriptive category, condition,
marketplace, and pallet sections.

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

Package confirmation also records the actual cost of boxes, mailers, tape, and
packing material. A package preset supplies the editable default, while the
confirmed package preserves the actual nonnegative amount. Operational profit
counts this amount as a direct selling cost and allocates a multi-item package
by packaged quantity.

Label purchase remains an eBay or external handoff. After purchase,
`record_shipment_label` requires final package confirmation and records the
actual source, carrier, service, tracking number, and cost. It advances the
shipment to `label_purchased` and appends an audit event; it does not claim that
PalletFlip purchased or insured the shipment.

Carrier handoff is a separate explicit confirmation after label recording.
`confirm_shipment_shipped` locks the order inventory, appends one idempotent sale
movement per line, consumes each active reservation, timestamps the shipment,
and records an audit event in one transaction. Repeating the command cannot
double-consume inventory.

Tracking history is append-only and keyed by a stable carrier, marketplace, or
client event identifier. Replaying an event is idempotent. Delivered events set
the delivery timestamp; exception events keep the shipment visibly blocked and
retain the carrier description. This command supports manual launch workflows
and later eBay event ingestion through the same contract.

## Returns Foundation

Returns preserve marketplace state and deadlines separately from physical
inventory decisions. A returned line remains unavailable until receipt and
inspection; importing or approving a return never silently increases stock.
Inspection history records received condition, completeness, notes, and a
recommended disposition. Final inventory outcomes include restock, repair,
parts, quarantine, supplier return, discard, and loss. Refunds, fee credits,
return shipping, and replacement shipping are append-only financial events so
the original sale is never erased.

Physical receipt appends a positive `return_receipt` movement and immediately
places an equal reservation on the units, leaving them on hand but unavailable.
Inspection does not alter quantity. Restock, revise, or repair releases the
quarantine reservation; parts, supplier return, discard, and loss consume the
quarantined units through an explicit negative movement. Every transition is
audited and idempotent where it affects quantity.

Manual return intake is available for launch and writes the same records used
by eBay return imports. It accepts only a shipped order line, cannot
exceed the sold quantity, and uses a client request key for idempotency. Creating
the return still leaves its inventory unavailable until physical receipt.

The observe-only eBay preview also reads seller returns and imports them only
when the return can be matched to exactly one previously imported order line.
Unmatched or ambiguous cases remain visible for review instead of guessing.
Repeated imports update marketplace state and deadlines without resetting a
local return that has already been received, inspected, resolved, or closed.
Import never receives, inspects, disposes, or restocks physical inventory.
Because eBay does not support return search in its Sandbox environment, a
return-read failure is reported separately and does not block inventory,
offer, or order reconciliation.

Return financial events are append-only and idempotent by external or client
event key. Refunds, partial refunds, fee credits, return shipping, replacement
shipping, and other adjustments remain separate from the original sale so
realized reporting can show the complete economic history.

Launch return-label purchase remains an eBay or external-carrier handoff.
`record_return_shipping_handoff` captures the source, payer, carrier, tracking
number, and cost, then moves the case to `in_transit`. An exact replay is
idempotent and conflicting replacement details are rejected. Seller-paid label
costs append one stable `return_shipping` financial event; buyer- or
marketplace-paid labels do not create a seller expense.

The Returns workspace presents the signed operational impact of these events:
fee credits increase the result, while refunds, return shipping, replacement
shipping, and other recorded costs decrease it. This remains labeled as an
operational estimate rather than accounting or tax advice and never erases the
original sale.

Launch return decisions use a guided eBay handoff. The owner completes the
action in eBay and then explicitly confirms its outcome in PalletFlip.
`record_confirmed_return_decision` appends an idempotent decision record and
updates workflow state, but it never submits an eBay action, changes physical
inventory, or fabricates a refund event. Refund money remains a separate
confirmed financial record. Direct marketplace decisions stay deferred until
production-only Post-Order behavior and applicable digital-signature rules can
be validated safely.

The Returns workspace treats marketplace action deadlines as an operational
queue. Open overdue cases sort first, followed by cases due within 24 hours,
then undated open work; resolved and closed history remains available below
active work. Deadline priority changes presentation only and never performs a
marketplace action automatically.

Return communication history is append-only and idempotent by external or
client event key. At launch, the owner copies a message already visible in the
eBay return conversation and explicitly confirms that fact. PalletFlip records
direction, source, body, and timestamp but never claims to have sent the
message. Direct message submission remains behind the same production API and
digital-signature validation gate as return decisions.

Return evidence uses a private `return-evidence` bucket with owner-scoped object
paths and an owner-scoped metadata table. Evidence is linked to the return and,
when applicable, its specific line. Inspection can compare the original and
returned serial numbers. A recorded mismatch requires serial or item-photo
evidence, forces the recommended disposition to quarantine, raises the return
to `exception`, and is protected by a database trigger that prevents any
restock or other disposition until a separate discrepancy resolution occurs.

Identity discrepancy resolution is itself a protected, append-only decision.
`identity_verified` permits the normal disposition choices only after the owner
confirms the unit was verified. `wrong_item_nonstock` permanently prevents
restock, revise, and repair; it permits only parts, supplier return, discard,
or loss. The database trigger enforces this distinction even if a client skips
the interface.

`close_return_case` is the only completed-return closure path. Every received
unit must leave quarantine through inspection and disposition. An unreceived
line can close only when the owner explicitly confirms that no physical
inventory will return. The financial outcome must contain at least one
append-only event or an explicit not-applicable confirmation. Closure stores
both outcome classifications, notes, timestamp, and an audit event; it never
deletes the original return, sale, inventory, or financial history.

Replacement fulfillment uses a distinct `replacement_shipment_lines` record
and a `return_replacement` inventory reservation. It never reuses the original
sale reservation. Starting fulfillment requires a confirmed replacement
decision, physically verified available inventory, and a quantity no greater
than the returned line. Carrier handoff appends a `replacement` inventory
movement and consumes only the replacement reservation, idempotently. The
external label handoff reuses the normal pick, pack, measurement, and tracking
workflow, while its cost appends a stable `replacement_shipping` return
financial event.

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
