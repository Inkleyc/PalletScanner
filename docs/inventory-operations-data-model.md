# PalletFlip Inventory Operations Data Model

## Purpose

This document translates the agreed product framework into a proposed domain
and persistence model. It is a design specification, not an implemented schema.
The migration must preserve current behavior and data until each replacement
workflow passes its acceptance tests.

## Design Rules

1. Keep the hobbyist interface simple even when the internal model supports
   later growth.
2. Preserve immutable business history; correct it with compensating records.
3. Treat quantity as a ledger-backed balance, not an editable number.
4. Separate physical inventory, work state, and marketplace state.
5. Keep marketplace-specific payloads behind adapters.
6. Make inbound events and outbound mutations idempotent.
7. Store money in fixed-precision decimal values with an explicit currency.
8. Store timestamps in UTC and render them in the owner's timezone.
9. Use server UUIDs as canonical keys and preserve current client IDs as
   migration/compatibility identifiers.
10. Every business table carries an ownership boundary enforced by row-level
    security.

## Ownership Boundary

Introduce a `businesses` record even though launch supports one owner. Sign-up
creates one business and one owner membership automatically; neither concept
needs to appear as team administration in the initial UI.

This provides a stable `business_id` for inventory, marketplace connections,
orders, jobs, and audit history. Future named users and roles can be added
without transferring every record away from a personal `owner_id`.

Core ownership tables:

- `businesses`
- `business_memberships`
- `business_settings`
- `device_installations`

Launch permits exactly one active owner membership. Device/session identity is
used for audit attribution; Supabase remains responsible for authentication and
session issuance.

## Entity Map

```text
Business
├── Settings
├── Acquisitions ── Inventory Items ── Inventory Units
│                    ├── Photos
│                    ├── Quantity Movements
│                    ├── Reservations
│                    └── Marketplace Listings
├── Orders ── Order Lines ── Reservations
│    ├── Shipments ── Packages ── Tracking Events
│    ├── Returns ── Return Lines ── Inspections
│    └── Financial Events
├── Marketplace Accounts ── Listings / Imported Events
├── Automation Jobs ── Attempts ── Exceptions
└── Activity Events
```

## Inventory and Acquisition

### `acquisitions`

Represents a pallet, auction lot, liquidation load, individual purchase batch,
or the system `Loose Items` container.

Important fields:

- `id`, `business_id`, `legacy_client_id`
- `type`: `pallet`, `lot`, `individual`, `loose_system`, `other`
- `name`, `source`, `purchased_at`, `currency`
- `purchase_price`, `inbound_freight`, `buyers_premium`, `acquisition_tax`
- `status`: `active`, `closed`, `archived`
- `is_system`, timestamps

Each business has exactly one nondeletable `loose_system` acquisition.

### `inventory_items`

Represents one stock identity/card. Multiple units share it only when the agreed
identity, condition, completeness, location, listing, and price rules match.

Important fields:

- `id`, `business_id`, `legacy_client_id`, `acquisition_id`
- immutable system identifier and optional unique seller SKU
- `name`, `category`, `condition`, `completeness`, notes
- product identifiers: UPC/EAN, brand, MPN, model
- `location_id` when location tracking is enabled
- cached `on_hand`, `reserved`, `on_hold`, and `available` balances
- estimated price range, floor price, intended listing price
- estimated/overridden allocated cost and provenance
- identity-confirmed and intake-complete flags
- archive timestamp and timestamps

Balances are caches constrained by and periodically reconciled against the
movement/reservation ledger.

### `inventory_units`

Optional unit-level rows for serial-tracked or otherwise unique units within an
inventory card.

Important fields:

- `id`, `business_id`, `inventory_item_id`
- serial number or other unique identifier
- unit condition/completeness overrides
- physical state and disposition
- received, sold, returned, and archived timestamps

Nonserialized interchangeable stock does not require one row per unit.

### `inventory_movements`

Immutable physical quantity ledger.

Important fields:

- `id`, `business_id`, `inventory_item_id`, optional `inventory_unit_id`
- signed quantity
- movement type and reason
- optional source acquisition, order line, return line, bundle, or correction
- actor/device and correlation/idempotency keys
- occurred/recorded timestamps and note

Movement types cover receipt, correction, sale, return receipt, restock,
damage, loss, discard, bundle consumption, split, and merge. Reservations are
separate commitments and do not pretend stock physically moved.

### `storage_locations`

Stores optional labels under the one launch business location. The table exists
even when tracking is disabled. Settings determine whether the UI and
publication requirement are active.

### `bundles` and `bundle_components`

Define a sellable bundle and the component quantities it requires. Availability
is calculated from components. A sale creates component reservations and
movements rather than duplicating inventory.

## Photos and Evidence

Keep item photos first class and add typed evidence links rather than storing
signed URLs:

- `media_assets`: private object path, media type, checksum, creator, timestamp
- `media_links`: asset, entity type/id, purpose, position

Purposes include listing photo, intake evidence, packing evidence, return
package, return item, damage, and dispute evidence. Short-lived signed URLs are
generated for viewing.

## Marketplace Model

### `marketplace_accounts`

Stores one business/channel connection, external seller identity, scopes,
connection state, sync mode, outbound-pause flag, and encrypted-token reference.
Actual credentials remain server-side.

### `marketplace_listings`

Links one inventory item or bundle to a channel listing.

Important fields:

- internal and external listing/offer/SKU identifiers
- channel and marketplace region
- publication/sync state
- advertised quantity and last confirmed external quantity
- price, currency, policy identifiers, category, item specifics
- last inbound/outbound versions and synchronization timestamps
- pause, error, and reconciliation state

### `listing_versions` and `listing_conflicts`

Preserve material local/external versions needed to explain edits and resolve
conflicts. Conflict resolution records which version won and who chose it.

### `marketplace_events`

Stores normalized inbound webhook/poll events with a unique channel event key,
raw-payload reference, processing state, and correlation ID. Reprocessing the
same event is safe.

## Orders and Reservations

### `orders`

Represents one marketplace or manual order, preserving the external order ID,
source, payment/fulfillment state, deadlines, fulfillment method, currency, and
minimal operational buyer/shipping data.

### `order_lines`

Represents each purchased SKU/item, quantity, pricing/tax breakdown, external
line ID, inventory match state, and cancellation/refund totals.

### `inventory_reservations`

Represents quantity committed to an order line or manual commitment.

Important fields:

- requested, reserved, released, and consumed quantities
- state: `active`, `released`, `consumed`, `shortage`
- source line, timestamps, expiration, and idempotency key

Available quantity cannot be negative. Any unfilled reservation demand is
stored as shortage quantity and generates an exception.

## Shipping

### `shipments`

Tracks fulfillment state, ship-by deadline, label source, carrier/service,
tracking, estimated and confirmed costs, shipped/delivered timestamps, and
local-pickup handoff where applicable.

### `shipment_packages`

Supports one or more packages with item weight, package preset, estimated/final
packed weight, dimensions, insurance fields reserved for later use, and label
reference.

### `shipment_package_lines`

Maps order-line quantities into packages and enables partial shipment.

### `package_presets` and `tracking_events`

Package presets store dimensions, tare weight, packing allowance, and optional
default supply cost. Tracking events retain carrier history without overwriting
earlier states.

## Returns, Refunds, and Disputes

### `returns` and `return_lines`

Preserve external IDs, order/line relationships, reason, responsibility,
marketplace decision state, requested/approved resolution, deadlines, labels,
tracking, and received/resolved timestamps.

### `return_inspections`

Stores inspector/device, original and received serials, condition,
completeness, notes, disposition, evidence, and resolution. Mismatch and
quarantine outcomes cannot create restock movements automatically.

### `refunds`, `replacements`, and `payment_disputes`

Separate financial resolution, replacement fulfillment, and chargeback state.
Each preserves external IDs, confirmation state, deadlines, and related
financial events.

## Financial Records

### `financial_events`

Append-only amounts linked to an acquisition, item, order, shipment, return,
refund, or marketplace account.

Types include:

- sale revenue;
- marketplace/advertising fee;
- outbound/return/replacement shipping;
- packaging supply;
- refund and fee credit;
- acquisition cost and cost allocation.

Fields include amount, currency, direction, provenance, estimate/final state,
external transaction ID, effective timestamp, and correction link. Sales tax
collected/remitted by a marketplace is recorded separately and excluded from
revenue.

## Automation, Exceptions, and Audit

### `automation_jobs` and `automation_attempts`

Persist background work, desired action, feature flag, idempotency key, retry
schedule, attempt results, and terminal state. This is the outbox/job boundary
for external mutations.

### `exceptions`

Represents actionable unresolved work with entity links, severity, deadline,
risk summary, recommended action, automation state, snooze/resolution data, and
the job/event that produced it.

### `activity_events`

Append-only human-readable audit records with business, actor type/id,
device/session, entity, action, before/after or structured details, reason,
correlation ID, and occurrence/record timestamps.

Automation attempts are technical evidence; activity events explain the
business history. Neither substitutes for the other.

## Settings

`business_settings` includes:

- automatic visible-SKU assignment;
- storage-location tracking;
- post-after-save prompt;
- marketplace automation pause;
- notification preferences;
- timezone/currency;
- shipping defaults and package presets;
- internal feature flags/rollout state.

Settings changes are audited. Disabling a feature does not delete its data.

## Migration from the Current Schema

### Compatibility Principles

- Add new tables and nullable links before changing current reads/writes.
- Preserve current UUIDs and `client_id` values.
- Do not automatically merge duplicate item records. Surface compatible records
  as reviewed merge suggestions; approval performs a real merge while retaining
  both source identities and histories in the surviving record.
- Do not recalculate historical money without marking the result as allocated or
  estimated.
- Backfill in idempotent steps with verification counts and rollback notes.
- Keep compatibility adapters until mobile and web use the same service
  contracts and the old path has passed parity checks.

### Proposed Migration Sequence

1. Create business/owner boundary and attach current owner-scoped rows.
2. Convert current pallets into `pallet` acquisitions.
3. Create the system `Loose Items` acquisition for every business.
4. Extend current inventory records with canonical UUID relationships, archive,
   seller SKU, identifiers, balances, and optional location.
5. Seed receipt movements matching each current item's quantity; preserve
   existing duplicate records separately until the owner approves a suggested
   merge.
6. Convert current marketplace listing rows without changing external state.
7. Preserve current sold records as explicitly labeled `Legacy sale` history,
   with their original IDs and financial/movement effects. Do not invent a
   falsely complete order, shipment, or payment lifecycle for data the current
   system did not capture.
8. Link existing photo objects through media assets/links without moving files
   until verified.
9. Preserve existing activity events and begin writing expanded events.
10. Introduce dual-read comparison, then dual-write or controlled cutover per
    repository capability.
11. Verify counts, balances, listing identifiers, money totals, photo access,
    and account isolation before retiring legacy fields.

Signed-in local inventory receives a guarded, one-time upload and reconciliation
workflow. It previews creates, matches, conflicts, and suspected duplicates
before committing, is idempotent if retried, and records its source device and
import run. Disposable local preview/demo data is clearly identified and may be
reset instead of entering the business record.

## Approved Architectural Decisions

1. Introduce the hidden internal business boundary at launch even though the
   first release supports one owner.
2. Use one inventory card plus ledger balances for interchangeable goods;
   create unit rows only for serialized or otherwise individually tracked stock.
3. Treat the immutable movement/reservation ledgers as authoritative. Cached
   balances exist only for performance; disagreement triggers cache repair and
   an auditable exception rather than rewriting ledger history.
4. Migrate incomplete historic sold data as `Legacy sale` records instead of
   fabricating complete orders.
5. Reconcile signed-in local inventory through a guarded one-time upload, while
   keeping disposable preview/demo data resettable and separate.
6. Keep existing duplicate cards separate until a merge is approved. Approval
   performs the merge and preserves both source histories, identifiers,
   quantities, media, and audit links.

No cleanup refactor or migration is allowed to publish, revise, end, refund, or
otherwise mutate an external marketplace as a side effect.
