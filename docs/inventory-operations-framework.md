# PalletFlip Inventory Operations Framework

## Purpose

PalletFlip is an inventory and resale operations hub for small firms that buy,
process, list, sell, ship, and sometimes receive returns for mixed merchandise.
The user should capture an item once and then manage its complete operational
life across connected marketplaces.

This document is a planning framework. It defines product boundaries, domain
language, sequencing, and safety requirements before implementation begins.

## Product Promise

> Capture it once. Know where it is, where it is listed, what is available,
> what sold, what must ship, what came back, and what the business earned.

The initial market message combines two promises:

1. scan, identify, and list acquired inventory faster;
2. run the complete small resale operation from one approachable system.

PalletFlip is the source of truth for physical inventory. Marketplaces are
sales channels. Marketplace data is imported and reconciled, but a channel
does not independently define how much stock the business owns.

PalletFlip remains useful without a marketplace connection. Connecting eBay
adds publishing, synchronization, order, shipping, and return automation; it is
not a prerequisite for inventory capture or management.

## Target Customer

The initial target ranges from a one-pallet-at-a-time hobbyist to a small,
owner-operated flipping business that:

- acquires mixed inventory by pallet, lot, liquidation, return, or individual buy;
- keeps goods in one primary warehouse, garage, shop, or storage location;
- lists primarily on eBay;
- needs stronger inventory control without enterprise software complexity;
- benefits from automation but needs clear exceptions and an audit trail;
- manages no more than approximately 5,000 active inventory records.

Inventory does not need to originate from a pallet. A user can capture an
individual household item, a child's toy, a yard-sale purchase, or any other
resale item without creating an artificial pallet or acquisition batch.

The first commercial release supports one owner account and one physical
inventory location. The owner may use that account on multiple devices. Shared
employee credentials are not treated as team support; named users, roles,
permissions, and multiple locations remain future extensions.

The architecture should leave clean seams for those extensions without adding
their administration or complexity to the initial product.

## Launch Scope

The first marketable version must remain useful to someone processing a single
pallet and approachable without formal warehouse or marketplace-operations
experience.

### Included

- one owner account on multiple devices;
- one physical location with lightweight bins, shelves, or storage labels;
- up to approximately 5,000 active inventory records;
- accumulated historical sales, closed inventory, and audit records beyond the
  active-record target;
- pallet and individually acquired inventory;
- grouped quantities for genuinely interchangeable units;
- eBay-first listing, inventory, order, shipping, and return operations;
- Facebook as an explicitly assisted/manual channel while retained;
- auditable automation and clear exception queues.

### Deferred

- employee invitations, named users, roles, and approval permissions;
- multiple warehouses, transfers, and per-location channel quantities;
- enterprise purchasing, receiving, and warehouse-management features;
- broad marketplace expansion before eBay workflows are proven;
- direct carrier-label purchasing if eBay handoff meets the initial need;
- automation rules that have not first been validated in observe or recommend mode.

## Accounts, Devices, and Ownership

### Launch Account Model

- One owner identity owns all inventory, pallets, photos, listings, orders,
  shipments, returns, settings, financial records, and audit history.
- The owner can remain signed in on multiple phones, tablets, and computers at
  the same time.
- Launch authentication uses an industry-standard passwordless email
  verification-code flow. Social sign-in and passwords are not launch
  requirements; they can be added later if customer demand justifies them.
- A successful sign-in creates a revocable device session. Explicit sign-out,
  session expiration, account recovery, or use of a new device requires email
  verification again.
- Mobile should offer Face ID, fingerprint, or device-passcode unlock after the
  first successful sign-in. Biometrics unlock the saved session and never
  replace the account identity or recovery flow.
- Customer builds do not expose Test Mode. Local/demo data bypasses are limited
  to development and explicitly marked internal builds.

### Connectivity and Synchronization

- Mobile supports capture and normal warehouse work during temporary loss of
  connectivity, then synchronizes when a connection returns.
- Web is online-first and should clearly report connectivity or synchronization
  failures rather than pretending a write succeeded.
- Concurrent edits merge automatically when different fields changed.
- If two devices changed the same material field from the same earlier version,
  PalletFlip preserves both values, flags a conflict, and asks the owner to
  choose rather than silently applying last-write-wins.
- Quantity, reservation, order, shipment, return, and marketplace-state changes
  use domain operations and idempotency rules; they are never reconciled as
  ordinary editable fields.
- Audit events record the device/session source and whether an action came from
  the owner, a marketplace, or automation.

### Account and Data Controls

- The owner can sign out of the current device and revoke all other sessions.
- The owner can export all business data in a documented portable format.
- Photos are included through a background archive/export process when an
  immediate download would be too large.
- Marketplace credentials remain encrypted and server-side.
- Disconnecting eBay disables future synchronization but retains inventory,
  listings, orders, returns, financial history, and audit records.
- Account deletion immediately disables sessions, automation, and marketplace
  credentials, then enters a 30-day recovery period before permanent erasure.
- Deletion must warn that external marketplace listings are not automatically
  ended unless the owner separately requests and confirms that action.

### Deferred Account Capabilities

- password login;
- Google or Apple social sign-in;
- employee invitations and named team identities;
- roles, granular permissions, and approval chains;
- ownership transfer between people or organizations;
- shared credentials as a supported collaboration model.

## Product Surfaces

### Mobile: Boots on the Ground

Mobile owns actions performed beside the physical item:

- receive, scan, identify, and photograph inventory;
- assign pallet and bin/location;
- count and adjust physical quantity;
- inspect condition and capture listing evidence;
- pick, pack, and confirm shipment details;
- receive and inspect returned merchandise;
- surface urgent warehouse exceptions.

Mobile should not become a dense marketplace administration or reporting app.

### Web: The Workhorse

Web owns operational control and business decisions:

- inventory review, search, filters, bulk actions, and reconciliation;
- listing preparation, publication, pricing, and marketplace exceptions;
- order, shipment, and return queues;
- marketplace connections, policies, and automation rules;
- profitability, aging, sell-through, and service reporting;
- audit history and failed-automation recovery.

### Backend: The Coordinator

The backend owns privileged and asynchronous work:

- marketplace credentials and API calls;
- order and return ingestion;
- inventory reservations and channel quantity synchronization;
- listing, pricing, fulfillment, and refund actions;
- webhook processing, scheduled polling, retries, and idempotency;
- append-only operational audit events.

## Operating Principles

1. **Inventory is conserved.** Every quantity change has a typed movement and
   an actor, source, reason, and timestamp.
2. **Reserve before decrementing.** A new order reserves stock immediately;
   cancellation releases it and completion consumes it.
3. **Automate the normal path.** Humans work from exception queues rather than
   repeating successful routine actions.
4. **Never hide automation.** Every marketplace mutation has a visible status,
   audit event, and recoverable failure state.
5. **Protect against overselling.** Available quantity is synchronized to all
   automated channels after reservations and adjustments.
6. **Keep marketplace adapters separate.** Core inventory, orders, shipping,
   and returns cannot depend on eBay-specific field names.
7. **Final money beats estimates.** Estimated fees and shipping are clearly
   labeled and replaced by imported transaction values when available.
8. **Used goods are not automatically fungible.** Quantity grouping is allowed
   only when identity, condition, completeness, location, and pricing match.

## Canonical Lifecycle

### Inventory Lifecycle

`received -> needs_photos -> needs_research -> ready -> listed -> reserved -> sold`

Inventory can also enter `hold`, `repair`, `discarded`, or `returned_inspection`.
Listing status remains separate from physical inventory status.

### Order Lifecycle

`imported -> paid -> picking -> packed -> shipped -> delivered -> completed`

Alternative outcomes include `cancelled`, `return_requested`, `returned`, and
`refunded`. An order may contain multiple line items and multiple shipments.

### Return Lifecycle

`requested -> awaiting_decision -> authorized -> in_transit -> received -> inspected -> resolved`

Resolution records one or more outcomes:

- restocked;
- restocked with changed condition or price;
- repaired or held;
- replacement sent;
- partial or full refund;
- discarded or recorded as loss.

Returned inventory is never automatically made available before inspection.

## Inventory Quantity Model

Each inventory record represents one SKU-like stock identity. It has:

- `on_hand`: physically controlled units;
- `reserved`: units committed to open orders;
- `available`: `on_hand - reserved - hold`;
- `listed`: per-channel advertised quantity;
- `sold`: historical units consumed by completed sales.

Quantity is derived from an append-only movement ledger, with cached totals for
fast reads. Movement types include receipt, correction, reservation, release,
sale, return receipt, restock, damage, loss, and transfer.

One card with quantity greater than one is appropriate only for interchangeable
units. Unique used items remain separate even if their product names match.

## Inventory Structure

### Acquisitions and Pallets

The canonical domain concept is an `acquisition`: a source event that brought
inventory into the business. Acquisition types can include pallet, auction lot,
liquidation load, estate purchase, yard-sale trip, individual purchase, or
other. An inventory item may also have no acquisition when its source is not
worth recording.

Pallets remain prominent in launch navigation, language, onboarding, and
reporting because they are central to PalletFlip's first audience and brand.
The broader internal model prevents a future expansion from requiring a data
rewrite. The PalletFlip name does not need to change unless the actual target
market and positioning move away from pallet and flipping workflows.

An acquisition records source, purchase date, purchase price, inbound freight,
other acquisition costs, notes, documents, and linked inventory. Profitability
can be viewed for one acquisition even when individual cost allocations remain
estimated.

### Inventory Identity

Every inventory record has an immutable system ID regardless of settings. A
separate human-readable seller SKU is optional:

- a setting controls whether PalletFlip automatically assigns visible SKUs;
- the setting defaults on for new accounts;
- turning it off affects future records and does not remove existing SKUs;
- a user can enter or replace a seller SKU subject to uniqueness validation;
- printable barcode or QR labels are deferred until after launch.

Product identifiers such as UPC/EAN, manufacturer part number, and serial
number remain distinct from both the system ID and seller SKU.

### Grouped and Individually Tracked Units

Multiple units can share one inventory card only when product identity,
condition grade, completeness/accessories, and storage location are compatible
and no unique serial tracking is required. A different AI price suggestion is
not, by itself, proof that a separate card is needed. PalletFlip presents the
differences and asks whether to add quantity to the existing card, create a new
card, or review the existing item first. If quantity is added, the owner chooses
whether to retain the existing price or apply the new suggestion.

Serialized goods use individually tracked unit records internally. The web app
may present matching units as a grouped product view without losing unit-level
history. If one grouped unit changes condition or completeness, `Split one
unit` creates a new card and copies the applicable identity, photos, and
listing draft for review.

Launch supports basic bundles or kits. A bundle references component inventory
and reserves or consumes the required component quantities when sold. Bundle
availability cannot exceed the least-available required component. Components
remain auditable and cannot be silently double-allocated.

### Cost Allocation

For an acquisition containing multiple items, PalletFlip suggests allocating
the total acquisition cost in proportion to each item's estimated resale value.
The allocation:

- includes purchase price and configured acquisition-level costs;
- is clearly labeled as an estimate;
- can be manually overridden per item;
- is recalculated only with explicit confirmation after estimates or inventory
  contents change;
- preserves the prior value and reason in the audit history.

### Storage Locations

Launch supports one physical business location and one storage label per
inventory card, such as `Shelf A3`, `Bin 14`, or `Garage / Rack 2`. `Unassigned`
is valid and appears in an attention queue when the item should be put away.

Storage-location tracking is an owner setting and defaults off for hobbyists.
When disabled, location fields, warnings, and publication blockers are hidden.
When enabled, items may still be captured as `Unassigned`, but a location is
required before marketplace publication. This makes location control useful to
an organized garage or small stockroom without burdening a casual seller.

If identical stock is stored in different places, it is split into separate
inventory cards. The data model preserves a location boundary so multiple
physical locations and stock transfers can be added later.

### Quantity Adjustments

Every manual quantity change requires a reason and optional note. Automated
changes supply a typed reason and correlation to the order, return, bundle, or
marketplace event that caused them. Supported movement reasons begin with:

- received;
- manual correction;
- reserved and reservation released;
- sold;
- return received and restocked;
- damaged, lost, or discarded;
- bundle assembly or consumption;
- split or merge between compatible inventory cards.

Current balances are cached for fast reads but must reconcile to the immutable
quantity movement ledger.

## Inventory Lifecycle and Audit

### Separate State Dimensions

PalletFlip does not compress physical inventory, work requirements, and channel
publication into one status.

Physical state describes possession and availability:

- available;
- reserved;
- on hold;
- sold;
- returned and awaiting inspection;
- damaged;
- lost;
- discarded.

Work state describes the next useful action and is calculated when possible:

- intake incomplete;
- needs photos;
- needs identification or research;
- needs a storage location;
- ready to list;
- listing attention required;
- ready to pick;
- ready to pack;
- ready to ship;
- return decision required;
- return inspection required;
- no action required.

Marketplace state remains per listing and per channel, such as draft,
publishing, active, ending, ended, or error. One item can therefore be
physically available, need better photos, and have an active listing without
contradictory status changes.

### Holds and Attention

- The owner can place inventory on hold so it cannot be newly listed, reserved,
  or sold through PalletFlip automation.
- A hold requires a reason and may include a note and expiration.
- Expired holds enter an attention queue; they do not silently release stock.
- PalletFlip calculates attention from missing data, deadlines, failures, and
  lifecycle state rather than depending on a manually maintained status.
- Noncritical recommendations may be snoozed or dismissed. Safety, quantity,
  financial, shipping-deadline, and marketplace failures remain visible until
  resolved.

### Archive, Delete, Merge, and Restore

- Unsaved drafts can be discarded without creating business history.
- Saved inventory is archived rather than deleted during normal use.
- Archived inventory stays searchable behind a filter, can be restored, and is
  excluded from normal inventory views and active-record totals.
- An accidental duplicate with no external or financial history may be
  permanently deleted after explicit confirmation.
- An item with listing, order, shipment, return, sale, financial, reservation,
  or quantity-movement history cannot be hard-deleted through normal controls.
- Compatible duplicate records can be merged while preserving both histories.
  Merge is blocked when identity or ownership conflicts or an active
  reservation cannot be safely reassigned.

### Audit Record

Material actions append an event containing what happened, when, actor type,
device/session, affected entities, before and after values, reason or note,
correlation ID, and success/failure/retry state.

Audit events remain for the lifetime of the account. They are not edited or
selectively deleted by the user. Corrections create compensating events.
Owners can add timestamped manual notes to an entity timeline.

Damaged, lost, and discarded movements require a reason and allow optional
photo evidence. Simple local actions may offer a short Undo window. An action
already sent to a marketplace is not shown as reversed until the marketplace
confirms the compensating action.

## Mobile Warehouse Workflow

### Scan Home and Acquisition Context

The existing mobile Scan home remains intentionally simple:

- Scan Barcode;
- Capture Photos;
- a smaller Add Manually action;
- the current active destination and a compact item-count/value summary.

PalletFlip automatically creates a permanent system acquisition named `Loose
Items`. It behaves like a pallet destination in current storage, filters, and
sync code, but does not imply that the inventory came from a purchased pallet.
It is always available, cannot be deleted, and allows a new user to capture an
individual item without setup. Pallets remain the prominent path for pallet
buyers.

The owner can select a pallet or `Loose Items` as the active scan destination.
The current first-pallet continuation behavior is retained when a user chooses
to create a pallet during intake.

### Capture Paths

The existing barcode-first and photo-first paths remain separate and focused:

- barcode mode opens the scanner automatically and retains manual entry and
  photo fallback;
- photo mode retains camera/library input, multiple photos, AI analysis, photo
  guidance, editable pricing, and listing drafts;
- manual mode creates an incomplete item from a name or temporary identifier
  and optional photos, without requiring AI.

AI and barcode results are suggestions. Identity may remain unconfirmed when
saving an incomplete record, but it must be confirmed before marketplace
publication.

When a barcode matches existing inventory, PalletFlip always asks whether to
add compatible quantity, create a separate item, or open the existing record.
Photo/AI similarity uses the same decision point. It never groups stock
silently, and it warns when condition, completeness, location, or serial
tracking makes a separate record safer.

### Save and Continue

- Preserve the existing explicit `Save & Next` and `Save & Stay` actions.
- Barcode `Save & Next` continues reopening the scanner automatically.
- Photo/manual `Save & Next` clears the prior item and returns to the matching
  capture start state.
- A photo, barcode, or temporary name is enough to save an incomplete item.
- Analysis, price range, floor price, location, and listing copy are not
  required merely to preserve captured work.
- Missing requirements produce calculated work states and review queues.
- Quantity saves as one grouped card when units are interchangeable instead of
  creating duplicate records. Existing duplicates are not automatically
  merged; PalletFlip may suggest a reviewed merge.

### Offline and Deferred Work

The phone can save incomplete items, photos, notes, acquisition assignment,
quantity, condition, and location while offline. AI, fresh barcode lookup,
marketplace requirements, and publication wait for connectivity. Pending work
is visible and retryable; failure never discards captured work.

eBay-specific category questions are deferred until listing review or
publication rather than interrupting rapid intake analysis.

### Mobile Inventory and Publication

Retain the current one-item mobile abilities to edit, publish, mark sold, and
remove/archive. Retain direct one-item eBay publication and the existing
post-after-save setting. Bulk publication, dense review, reconciliation, and
automation administration remain web responsibilities.

The web dashboard continues to allow item creation as a fallback convenience,
not as the promoted intake path. The mobile Dashboard tab remains a shortcut to
the web workhorse for launch.

## Web Workhorse Workflow

### Navigation and Responsibilities

Preserve the existing web foundation and add one primary destination:

- Overview;
- Review;
- Inventory;
- Orders;
- Pallets;
- Data / Analysis;
- Settings.

`Orders` owns the post-sale operational flow through approachable tabs rather
than separate top-level shipping and return applications:

- needs attention;
- ready to pick;
- ready to pack;
- ready to ship;
- shipped;
- returns;
- completed.

### Overview and Review

Overview places urgent work before business metrics. Its `Today's work` area
shows orders requiring action, approaching ship-by deadlines, returns awaiting
a response, and failed marketplace synchronization. The existing performance
metrics remain immediately below it.

Review remains exclusively focused on inventory and listing quality: missing
photos or identification, incomplete listing requirements, publication
failures, aging inventory, and later price recommendations. Orders and returns
do not get mixed into the listing-review queue.

### Inventory and Manual Sales

Inventory remains the complete searchable record with photos, editable item
data, quantity movements, listings, sales, returns, archive/restore, filters,
exports, and safe bulk actions.

Manual sale recording remains available without an eBay connection. It reduces
the applicable quantity through the movement ledger and asks whether fulfillment
is shipping, local pickup, or other. Sale, shipment, and financial details stay
linked rather than collapsing into one `soldPrice` field.

Archived inventory appears through an Inventory filter rather than separate
navigation. Bulk actions are initially limited to safe operations such as work
state, storage location, acquisition assignment, archive, and listing
preparation. Bulk sale, refund, and permanent deletion are prohibited.

### Item Creation and Record Presentation

Retain desktop item creation as a fallback with its current photo upload, AI
analysis, and full edit form. `Loose Items` is its default destination.

Keep the existing focused panel/modal interaction for item, order, shipment,
and return records in the initial release. Each entity shows its own filtered
audit timeline. Global Activity remains under Settings. Full-page records can
be introduced later only when a panel can no longer present the workflow
clearly.

### Pallets, Settings, and Data Mode

`Pallets` remains the customer-facing navigation label. The section presents
ordinary pallets prominently and gives `Loose Items` a distinct summary without
requiring general acquisition terminology.

Settings continues to own account controls, marketplace connections and
policies, backups/exports, automation settings, and global activity. The web app
must show an unmistakable warning before meaningful work is entered into local
preview data rather than the signed-in cloud account.

## Pre-Implementation Housekeeping Gate

No inventory-hub feature implementation begins until the current application
passes a behavior-preserving cleanup phase. Planning and documentation may
continue before that gate.

The cleanup must include:

- inventory of active, hidden, demo-only, obsolete, and duplicated routes;
- removal or isolation of mobile-web demo code that is not part of the two
  supported product surfaces;
- correction of the mobile Dashboard shortcut to the real web workhorse URL;
- removal of customer-facing test/demo access from production builds;
- decomposition of oversized mobile capture, barcode, inventory, settings, and
  web dashboard components into testable services and focused components;
- consolidation of duplicated listing, parsing, status, and repository logic;
- explicit boundaries between core domain rules, application services,
  persistence adapters, marketplace adapters, and UI;
- reconciliation of local and Supabase repository behavior;
- replacement of destructive item/pallet behavior with compatibility-safe
  service boundaries in preparation for archive semantics;
- cleanup of dead code, hidden legacy screens, generated artifacts, encoding
  errors, scripts, documentation, environment examples, and dependencies;
- tests that lock down current capture, save-next, cloud sync, eBay posting,
  sale recording, pallet management, and dashboard behavior before refactoring;
- one clean full validation run and a dedicated cleanup checkpoint commit.

Housekeeping must not silently redesign workflows or migrate production data.
Any behavior change discovered during cleanup returns to this framework as an
explicit decision.

## eBay Listings and Synchronization

### Initial Import and Reconciliation

Connecting eBay starts by importing all active listings in observe-only mode.
Imported listings count toward the approximately 5,000 active-record target.
No live listing is mutated until the owner reviews and approves an initial
reconciliation summary.

Matching priority is:

1. PalletFlip seller SKU;
2. known eBay listing or offer ID;
3. UPC/EAN or manufacturer identifier;
4. strong product identity plus distinguishing attributes;
5. manual selection.

Title similarity alone never silently links inventory. An unmatched listing can
create a PalletFlip inventory record directly from its eBay data. Until the
owner verifies physical possession and quantity, it remains `Unverified imported
inventory` and is excluded from trusted available stock.

Quantity discrepancies require the owner to confirm the physically correct
count before synchronization is enabled. The initial review shows matched,
uncertain, unmatched, and conflicting records and the actions that enabling
sync will take.

### Authoritative Synchronization

After reconciliation, PalletFlip is authoritative for available quantity:

- quantity changes synchronize automatically;
- a final unit sold elsewhere automatically withdraws the eBay offer;
- failures retry idempotently and create an urgent exception;
- success is not recorded until eBay confirms the operation;
- imported orders, cancellations, marketplace statuses, and returns update the
  corresponding PalletFlip records and audit trail.

Price and listing-content edits require confirmation before PalletFlip pushes
them during the initial release. A listing can pause synchronization without
disconnecting the seller account; the paused state and resulting inventory risk
remain visible.

### External eBay Changes

Orders, actual sold quantities, cancellations, and eBay-generated lifecycle
statuses import automatically. Material external edits to price, title,
description, quantity, item specifics, or policies create a review task rather
than being immediately overwritten.

The owner chooses `Use eBay version` or `Push PalletFlip version`. PalletFlip
records both versions, the resolution, actor, and resulting synchronization.

### Deferred eBay Capabilities

Seller offers, promotions, advertising, traffic analytics, and automated
repricing are deferred until inventory, order, shipping, and return operations
are reliable. The future implementation should orchestrate eligible native eBay
capabilities rather than reproduce Seller Hub.

## Orders and Oversell Protection

### Order Intake and Reservation

PalletFlip records an inbound marketplace order and its original order/line
identifiers before processing it. Repeated delivery of the same marketplace
event is idempotent and cannot create duplicate orders or reservations.

Inventory reserves immediately when an eBay order is received, including while
payment is pending. Unpaid orders appear in Orders but do not enter the pick
queue. Cancellation or expiration automatically releases the reservation unless
the owner has separately placed the inventory on hold.

Each order line maps to inventory independently. An unmatched line preserves
the order and creates an urgent matching task. One marketplace order remains one
PalletFlip order with multiple pick lines rather than being split into separate
orders.

### Quantity and Oversell Rules

Available quantity is `on hand - reserved - on hold`. Automated marketplace
quantities derive from that value.

If an inbound order exceeds trusted availability, PalletFlip:

- records a separate shortage amount without allowing available stock to become
  negative;
- immediately reduces or pauses other automated listings where possible;
- marks the order and inventory as an urgent oversell risk;
- asks the owner to resolve whether physical stock exists, a prior count was
  wrong, or an order must be cancelled;
- preserves all attempted actions and results in the audit history.

### Manual Sales and Assisted Channels

A manual or local sale starts as a commitment that reserves inventory. Payment
or confirmed handoff consumes it. The owner selects quantity and fulfillment
method: shipping, local pickup, or other. Buyer name and contact storage are
deferred from launch to minimize unnecessary personal data.

A sale on any channel reduces automated listings immediately. Assisted listings
such as Facebook create a high-priority manual removal/update task because
PalletFlip cannot guarantee the external action.

### Partial Operations and Notifications

The underlying order model supports partial cancellation, partial shipment, and
partial refund per line from the beginning. The initial interface presents
these as straightforward line-item actions.

Configurable mobile notifications cover paid orders, cancellations, and failed
oversell protection. Notification delivery supplements rather than replaces the
persistent web exception queue.

## Shipping and Fulfillment

### Launch Label Workflow

PalletFlip coordinates fulfillment but hands eBay label purchase to eBay for
launch. After purchase, PalletFlip imports or records the final carrier,
service, label cost, tracking number, and shipment status. Direct carrier
billing and label purchasing are deferred.

The paid-order flow is:

1. ready to pick;
2. item and included parts confirmed;
3. ready to pack;
4. package and final measurements confirmed;
5. service selected and eBay label purchased;
6. tracking synchronized;
7. shipped and later delivered/completed.

### Weight, Dimensions, and Packages

Item-only weight is optional during intake. PalletFlip can estimate packed
weight by combining item weight with a selected package preset's tare weight
and packing allowance. The estimate is labeled and must be confirmed or
replaced during fulfillment before label purchase.

When an eBay fulfillment policy requires calculated shipping information,
estimated packed weight is required before publication. If the selected policy
does not require it until fulfillment, weight can remain incomplete during
intake and listing.

Dimensions are optional until required by the selected policy or service.
Launch includes standard presets and owner-defined presets such as `Laptop box`.
Each preset can store dimensions, empty-package weight, and default packing
allowance. The shipment model supports multiple packages per order even though
the common interface defaults to one.

### Domestic, International, and Pickup

PalletFlip suggests domestic-only or international eligibility during listing
preparation and the owner confirms it. Eligible eBay listings prefer eBay's
supported international-shipping program rather than making PalletFlip own
customs and international label logic at launch.

Local pickup remains reserved until the owner manually confirms buyer handoff;
only then does the quantity become sold/completed.

### Packing Evidence and Deadlines

The mobile packing flow allows optional photos of the item, included parts, and
sealed package. PalletFlip recommends evidence photos for fragile, valuable, or
higher-risk categories but does not require them at launch.

Configurable notifications warn before the ship-by deadline, with initial
defaults of approximately 24 hours and 4 hours remaining.

### Deferred Insurance Automation

Insurance recommendations, configurable coverage thresholds, fragility-based
coverage rules, and automatic insurance purchasing are deferred from launch.
PalletFlip may retain fragile/high-value handling flags for packing guidance and
future insurance logic, but it does not claim to recommend or arrange coverage
until that feature is intentionally designed and validated.

## Returns, Refunds, and Disputes

### Return Intake

PalletFlip automatically imports every eBay return, including returns already
auto-approved by marketplace policy. It records the original order line,
reason, requested resolution, responsibility, deadlines, messages, labels, and
actions eBay has already taken. Repeated events are idempotent.

An auto-approved return enters its active workflow without asking the owner to
approve a decision that eBay has already made. Returns requiring action show
only currently valid marketplace options and their consequences.

Refund, partial-refund, replacement, and permitted decline actions require
explicit owner confirmation at launch. PalletFlip submits supported confirmed
actions directly through eBay and falls back to a guided eBay handoff when an
action is unavailable through the integration.

Payment disputes and chargebacks appear as separate high-priority financial
exceptions within Orders rather than being treated as physical returns.

### Return Shipping and Deadlines

Launch return-label purchase remains in eBay's workflow. PalletFlip records who
pays, label cost, tracking, response deadlines, and shipment progress. Missed or
approaching return deadlines generate escalating configurable mobile alerts and
remain visible in the web exception queue.

### Receiving and Inspection

Returned inventory remains unavailable until inspection is complete. Mobile
inspection can record package/item photos, identity, serial number, condition,
missing parts, damage, notes, and one of these dispositions:

- restock unchanged;
- restock with revised condition or price;
- repair or hold;
- use for parts;
- return to supplier;
- quarantine or investigate;
- returned item does not match;
- discard;
- record as loss.

Replacement shipments are supported in the underlying order/shipment model from
launch. `Refund without return` displays an additional warning that no stock
will return to inventory.

### Serial and Identity Discrepancies

When the original unit had a serial number, return inspection requires checking
it. A mismatch:

- records original and returned serials plus evidence photos;
- quarantines the received unit and prevents restocking;
- keeps the original unit unresolved rather than marking it returned;
- creates an urgent evidence/dispute task with the applicable eBay deadline;
- uses factual discrepancy language and does not automatically characterize the
  buyer's intent;
- requires an explicit resolution after eBay or the seller decides the case.

Evidence photos are recommended for every return and required before PalletFlip
submits an evidence-based damaged, wrong-item, or identity-dispute action.

### Financial Resolution

PalletFlip calculates expected refund and profitability impact before
confirmation. It records item refund, original or return shipping, fee credits
or losses, replacement cost, and inventory disposition as separate financial
events. A correction appends a compensating record rather than rewriting the
original transaction. Success is shown only after marketplace confirmation.

## Reporting and Profitability

### Report Positioning

PalletFlip presents operational results for reseller decisions, not formal tax
or accounting advice. The friendly user-facing label is `Estimated profit`,
with definitions explaining included and excluded costs. Projected inventory
value is never presented as realized profit.

Every monetary value carries a provenance where relevant:

- estimated;
- confirmed/imported;
- manually entered;
- allocated.

When marketplace-reported fees replace estimates, PalletFlip preserves the
earlier estimate in history and uses the confirmed value in current reports.
Marketplace-collected sales tax is excluded from revenue and profit.

### Cost and Contribution Model

Acquisition landed cost includes purchase price, inbound freight, buyer's
premium, acquisition tax, and other acquisition-level costs. The agreed
proportional allocation supplies estimated item/unit cost with manual override.

Direct selling costs include marketplace and advertising fees, outbound label
cost, optional per-shipment packaging supplies, refunds, return shipping, and
replacement shipment cost. Reusable packaging-cost defaults are supported.

Launch estimated profit is:

`item revenue - direct selling costs - allocated acquisition cost`

General miscellaneous expenses, owner labor, time valuation, mileage, rent,
utilities, subscriptions, equipment depreciation, and income tax tracking are
deferred to avoid accounting-product complexity.

### Report Views

Overview retains and extends the existing metrics with active item and unit
counts, urgent work, fulfillment workload, revenue, estimated profit,
sell-through, aging, and acquisition cost recovery.

Pallet/acquisition reporting includes landed cost, item and unit counts,
outcomes, revenue, direct costs, cost recovered, remaining estimated value,
realized result, projected result, and break-even progress. `Cost recovered` is
the primary pallet success indicator.

Item/SKU reporting includes allocated unit cost, listing history, sale price,
fees, shipping/return cost, estimated profit, days to list, and days to sell.
Marketplace, category, and condition reports include item and unit counts,
sell-through, average price, fees, shipping, return rate, estimated profit, and
time to sell.

Reports always separate realized results from projected remaining value.
Returned/refunded transactions remain in gross sales history with refunds shown
separately rather than disappearing.

Detailed CSV and printable/PDF summaries remain supported. Timestamps are
preserved for future workflow-duration reporting even though time tracking and
hourly-profit reports are deferred.

## Automation, Exceptions, and Security

### Launch Automation Boundary

PalletFlip automatically imports marketplace listings, orders, cancellations,
shipments, returns, confirmed fees, tracking, and delivery states. After initial
reconciliation and early-tester opt-in, it can reserve/release inventory,
synchronize available quantity, withdraw final-unit eBay listings, calculate
deadlines, and retry safe idempotent failures.

The owner confirms new publication, price/content changes, external-edit
resolution, refunds, replacements, return declines, dispute evidence, physical
quantity corrections, risky archival, permanent eligible deletion, and initial
sync enablement.

Launch never automatically publishes solely from AI output, reprices active
listings, purchases insurance, permanently deletes business history, cancels a
buyer order, characterizes buyer intent, or makes tax/accounting decisions. AI
cannot publish or materially change an active listing without approval.

### Pause and Retry Controls

Launch Settings contains one simple `Pause outbound marketplace automation`
control. It stops external mutations while continuing to import orders,
cancellations, returns, and other safety-critical inbound state. Local inventory
remains usable.

A full pause hierarchy, per-marketplace/listing controls, and queued-change
resume preview are deferred. On launch resume, PalletFlip recalculates desired
state from current facts. Material conflicts require confirmation; safe current
state synchronization proceeds through normal audited jobs.

Transient failures retry automatically with increasing delay and a finite
attempt limit. Exhausted work becomes an urgent exception and supports manual
retry after correction. Background jobs continue when client apps are closed.

### Exception Center

The persistent web exception queue includes unmatched records, quantity
conflicts, shortage risk, failed listing mutations, external edits,
authentication/payment failures, shipping/return deadlines, missing package
data, identity discrepancies, failed financial actions, and exhausted jobs.

Each exception explains what happened, what is at risk, attempts already made,
recommended action, automation state, deadline, and attempt history. Critical
exceptions remain until resolved; noncritical recommendations can be dismissed
or snoozed.

### Security Baseline

- Supabase row-level ownership and private signed photo access;
- encrypted server-side marketplace tokens and least-required scopes;
- no marketplace secrets, direct AI keys, demo tokens, or customer-facing test
  controls in production clients;
- passwordless email identity, revocable sessions, and mobile biometric unlock;
- rate limits, idempotency keys, protected exports, and append-only audit;
- immediate outbound pause when marketplace authorization expires;
- minimal buyer personal data;
- feature flags separating import, reservation, quantity sync, fulfillment, and
  return automation during staged testing.

Outside beta users begin with Observe/Recommend behavior and explicitly opt into
automatic quantity protection. Proven safe defaults can become automatic later.

### Market-Ready Boundary

Implementation proceeds through internal milestones, but PalletFlip is not
described as market-ready until the complete standalone inventory and eBay
inventory-to-return lifecycle is reliable. Launch includes loose/pallet intake,
offline incomplete capture, grouped quantities, optional locations, cloud/web
operations, listing reconciliation/publication, orders and oversell protection,
pick-pack-ship with eBay label handoff, returns and confirmed eBay actions,
audit, exceptions, exports, and account controls.

Insurance, repricing, additional marketplaces, direct carrier labels, teams,
multiple locations, full pause hierarchies, and accounting overhead remain
deferred.

## Core Domain Areas

### Inventory

- products/SKUs and individually tracked items;
- pallets or acquisition lots;
- storage locations;
- quantity balances and movements;
- cost allocation and condition history;
- photos and identifying evidence.

### Marketplace Listings

- one inventory identity to many channel listings;
- listing drafts, required attributes, offers, and publication state;
- channel quantity and price synchronization;
- listing health, errors, and manual-channel tasks;
- price floors and automation rules.

### Orders

- external and internal order identities;
- line items mapped to PalletFlip inventory;
- immediate idempotent reservations;
- payment, cancellation, and fulfillment state;
- fees, taxes, refunds, and net proceeds.

### Shipping

- ship-from location and destination;
- package count, dimensions, weight, and contents;
- buyer-selected service and ship-by deadline;
- service recommendation and insurance recommendation;
- label source, cost, tracking, and delivery state.

The first version may hand off label purchase to eBay while importing the final
label, service, cost, and tracking details. Direct carrier purchasing is a later
capability and should not block reliable fulfillment tracking.

### Returns

- listing return policy at publication time;
- marketplace return request ingestion;
- reason, responsibility, deadlines, messages, and labels;
- approval, replacement, refund, and receiving workflows;
- inspection outcome and inventory disposition;
- final profitability impact.

### Audit and Automation

- append-only business events;
- actor types: user, marketplace, rule, scheduled job, or system;
- before/after values for material changes;
- correlation IDs spanning inbound events and outbound actions;
- idempotency keys for marketplace mutations;
- retry state, attempt history, and manual resolution.

## Marketplace Strategy

### Tier 1: eBay

The first automated channel. PalletFlip should eventually use eBay inventory,
order, fulfillment, returns, finances, analytics, marketing, and negotiation
capabilities where account eligibility and APIs permit.

PalletFlip should orchestrate these capabilities rather than recreate eBay's
buyer-facing marketplace tools.

### Tier 2: Next Automated Marketplace

Select only after inventory categories and target-customer accounts are known:

- Walmart is a strong candidate for general merchandise and supports broad
  listing, inventory, pricing, order, return, and reporting automation.
- Amazon is powerful but has heavier catalog, eligibility, condition, and
  onboarding requirements.
- Etsy is appropriate only for qualifying vintage, handmade, or craft goods.

### Assisted Channels

Facebook Marketplace remains an assisted channel unless a reliable supported
seller integration becomes available. PalletFlip may track the listing and
create urgent removal/update tasks, but it must not imply guaranteed automatic
inventory protection on a manual channel.

## Automation Levels

Every automated action belongs to one of three levels:

1. **Observe:** import and report without changing external state.
2. **Recommend:** prepare a proposed action for approval.
3. **Act:** execute within user-configured rules and record the result.

Initial defaults:

- order import and stock reservation: act;
- quantity reduction on automated channels: act;
- final-unit listing withdrawal: act;
- failed synchronization: stop, alert, and retry safely;
- repricing: recommend until rules and history are trusted;
- return intake and deadline tracking: act;
- refund, replacement, and return disposition: require review initially;
- shipping and insurance selection: recommend initially.

## Required Exception Queues

The web app must make operational failures visible:

- unmatched marketplace order line;
- oversold or negative availability risk;
- channel quantity mismatch;
- listing publication or withdrawal failure;
- missing package weight or dimensions;
- shipment approaching its ship-by deadline;
- return awaiting response or inspection;
- imported fee/refund discrepancy;
- automation job exhausted its retry policy.

## Data Model Evolution

The current schema is a useful starting point, but the next design pass should
introduce first-class tables for:

- organizations, memberships, and locations;
- stock identities and inventory units where individual tracking is needed;
- inventory balances and immutable quantity movements;
- marketplace accounts and channel listings;
- orders and order lines;
- inventory reservations;
- shipments, packages, labels, and tracking events;
- returns, return lines, inspections, refunds, and dispositions;
- financial transactions and cost allocations;
- automation rules, jobs, attempts, and exceptions;
- expanded activity/audit events.

The migration must preserve current pallet, inventory, listing, sale, photo, and
activity data. Existing client IDs remain compatibility identifiers during the
transition.

## Delivery Roadmap

### Phase 0: Discovery and Decisions

- interview the demo reviewer and two or more target sellers;
- document current paid inventory tools and painful daily workflows;
- establish target inventory volume, order volume, categories, and staffing;
- confirm eBay account capabilities and access requirements;
- decide first-version shipping and return automation boundaries;
- produce workflow maps and an approved domain model.

Exit: decisions are recorded and no critical workflow depends on an assumption.

### Phase 1: Inventory Authority and Audit

- introduce SKU/stock identity and quantity movement concepts;
- support safe grouped quantities and individually tracked used goods;
- add locations, reservations, reconciliation, and expanded audit events;
- migrate existing inventory without changing current user workflows.

Exit: every available quantity is explainable from recorded movements.

### Phase 2: eBay Read Synchronization

- import existing listings, orders, fees, fulfillment, and return summaries;
- match external SKUs/listings to PalletFlip inventory;
- build reconciliation and unmatched-record queues;
- run in observe-only mode before enabling mutations.

Exit: imported eBay activity reconciles against real seller data.

### Phase 3: Oversell Protection

- reserve inventory from paid/open orders;
- update quantities across automated listings;
- withdraw final-unit listings;
- add idempotent retries, alerts, and audit correlation.

Exit: simulated and sandbox multi-channel races cannot silently oversell stock.

### Phase 4: Shipping Operations

- add pick, pack, package, ship-by, and tracking queues;
- recommend service and insurance from configured rules;
- integrate the eBay label handoff and import final shipping costs;
- support shipment exceptions and delivery tracking.

Exit: a seller can fulfill an eBay order without losing operational context.

### Phase 5: Returns Operations

- ingest return requests and deadlines;
- manage decisions, messages, labels, receipt, and inspection;
- record refunds, restocking, damage, loss, and profitability impact;
- introduce guarded automation after manual workflows are proven.

Exit: every return has an owner, deadline, financial result, and inventory result.

### Phase 6: Pricing and Marketplace Expansion

- add guarded repricing, buyer offers, promotions, and performance analytics;
- evaluate Walmart, Amazon, or Etsy against actual customer inventory;
- add one marketplace adapter at a time using the same inventory contract.

Exit: new channels do not duplicate core inventory or order logic.

## Definition of Done for Every Phase

- domain rules and ownership are documented;
- migration and rollback paths are defined;
- automated actions are idempotent and auditable;
- failure and reconciliation queues exist;
- permissions and secrets remain server-side;
- mobile and web responsibilities stay within their product roles;
- tests cover quantity conservation and cross-account isolation;
- real workflow acceptance criteria are exercised end to end.

## Approved End-to-End Acceptance Scenarios

1. A new hobbyist can create an account, skip eBay, add an item to `Loose
   Items`, and manage it through sale without needing to understand pallet
   terminology.
2. The owner can create a pallet with landed cost, scan several items on the
   phone, preserve incomplete work, and finish it from the web dashboard.
3. The phone can capture inventory offline, clearly identify pending uploads,
   and synchronize later without creating duplicate records.
4. A known barcode or similar AI result presents `Add quantity`, `Create new`,
   and `Review existing` choices and never groups inventory silently.
5. Interchangeable units share one inventory card. Sales, losses, returns, and
   corrections create ledger entries and leave an explainable available balance.
6. Condition, completeness, location, and serial-tracking differences warn
   that a separate card or unit may be required. A price suggestion alone
   triggers an owner decision; adding quantity also asks whether to keep the
   current price or apply the new suggestion.
7. PalletFlip can import active eBay listings without changing them, match or
   create inventory through review, and quarantine uncertain quantities.
8. After explicit synchronization approval, a received eBay order reserves
   inventory immediately, prevents overselling, and creates an urgent exception
   for missing or insufficient inventory.
9. The owner can pick, pack, confirm final weight, hand label purchasing to
   eBay, import tracking and cost, and complete shipment in one Orders workflow.
10. An imported return remains unavailable until inspection and can be
    restocked, revised, repaired, used for parts, quarantined, returned to a
    supplier, discarded, or recorded as a loss.
11. Pausing outbound marketplace automation prevents PalletFlip from changing
    eBay while inbound orders, returns, tracking, and other safety data continue.
12. Reports distinguish projected and realized results, include landed and
    direct selling costs, show pallet cost recovery, and retain refunds without
    erasing original sales.
13. Existing local data can be reconciled into the signed-in business without
    loss. Duplicates remain separate until reviewed; approval creates one card
    with the complete combined history.
14. Failed external actions retry idempotently, cannot duplicate listings,
    orders, refunds, or movements, and become persistent actionable exceptions
    after retries are exhausted.
15. The owner can use mobile for intake and physical work and web for review and
    operations without either product becoming a duplicate of the other.

## Recorded Launch Decisions

1. Serve the one-pallet hobbyist through the small owner-operated flipping business.
2. Design and test for approximately 5,000 active inventory records.
3. Support one owner identity on multiple devices in the first commercial release.
4. Support one physical location with lightweight internal storage labels.
5. Defer named team accounts, permissions, and multiple locations.
6. Keep the architecture extensible without exposing deferred complexity in the UI.
7. Make all core inventory workflows usable without an eBay connection.
8. Allow inventory to exist without a pallet or acquisition lot.
9. Treat 5,000 as the active-record target, not a limit on retained history.
10. Lead with faster scan-to-list and complete small-resale operations.
11. Keep pallets prominent while using a broader acquisition model internally.
12. Give every record an internal ID and make automatic visible SKU assignment
    a default-on account setting; defer label printing.
13. Group only interchangeable units and split units when their condition,
    completeness, location, price, or tracking requirements differ.
14. Support serialized unit history and basic component-based bundles.
15. Suggest acquisition cost allocation in proportion to estimated resale
    value, with manual overrides and an audit trail.
16. Use one storage label per inventory card and require reasons for manual
    quantity changes.
17. Keep physical, work, and marketplace states separate.
18. Calculate attention automatically and allow snoozing only when the issue is
    noncritical.
19. Archive saved inventory by default and prohibit normal hard deletion after
    external, financial, or quantity history exists.
20. Preserve compatible histories during duplicate merges.
21. Retain append-only audit history for the account lifetime and support
    manual timeline notes plus optional damage/loss photo evidence.
22. Create a permanent `Loose Items` acquisition so non-pallet intake requires
    no additional setup.
23. Keep the current barcode/photo Scan home and add a secondary manual path.
24. Allow incomplete and offline saves without analysis or completed pricing.
25. Preserve `Save & Next`, `Save & Stay`, direct one-item eBay publishing, and
    the configurable post-after-save prompt.
26. Replace quantity duplication with reviewed grouped quantity and never
    silently merge barcode matches or existing duplicates.
27. Make storage-location tracking a default-off setting; when enabled,
    require a location before publication.
28. Defer eBay category questions to listing review/publication.
29. Retain one-item mobile inventory actions, fallback web item creation, and
    the mobile shortcut to the web dashboard.
30. Add one web `Orders` destination with pick, pack, ship, return, and complete
    tabs rather than separate top-level applications.
31. Put urgent operational work before metrics and keep Review dedicated to
    inventory/listing quality.
32. Retain manual sales with fulfillment method, panel-style records, per-entity
    timelines, and global Activity under Settings.
33. Keep `Pallets` in navigation, show archive as an Inventory filter, and
    restrict bulk actions to safe nonfinancial operations.
34. Preserve desktop item creation as a fallback and clearly distinguish local
    preview data from cloud business data.
35. Complete and checkpoint behavior-preserving codebase housekeeping before
    implementing the inventory-operations roadmap.
36. Import all active eBay listings in read-only mode and require an approved
    reconciliation before enabling writes.
37. Use strong identifiers for automatic matching, allow item creation from an
    unmatched listing, and quarantine unverified imported inventory.
38. Make quantity synchronization and final-unit withdrawal automatic after
    reconciliation; require confirmation for price/content pushes initially.
39. Detect external eBay edits, resolve them explicitly, and support pausing one
    listing without disconnecting the account.
40. Defer eBay offers, promotions, traffic analytics, and repricing until the
    core post-sale workflows are proven.
41. Reserve inventory as soon as an eBay order is received, hold unpaid orders
    outside picking, and release reservations after cancellation or expiry.
42. Preserve unmatched orders as urgent work and keep multi-line orders intact.
43. Never allow negative available quantity; represent shortage separately and
    immediately protect remaining automated channels.
44. Treat manual sales as reservations followed by fulfillment, defer buyer
    contact storage, and create urgent tasks for assisted-channel removal.
45. Model partial cancellation, shipment, and refund from launch and provide
    configurable order/cancellation/oversell mobile notifications.
46. Hand off launch label purchasing to eBay and import the confirmed carrier,
    service, cost, tracking, and status.
47. Support optional item weight plus package-preset estimates, requiring final
    confirmation during fulfillment and listing-time estimates only when the
    selected policy requires them.
48. Include standard/custom package presets, optional dimensions, and a
    multi-package shipment model.
49. Suggest domestic/international eligibility, prefer eligible eBay
    international shipping, and require manual confirmation of local pickup.
50. Support optional packing evidence and configurable ship-by reminders.
51. Defer insurance recommendations and purchasing while retaining optional
    fragile/high-value handling flags for future use.
52. Import every eBay return, respect marketplace auto-decisions, and require
    confirmation for seller-controlled financial actions.
53. Keep return labels in eBay at launch, track deadlines, and escalate alerts.
54. Keep returned stock unavailable through inspection and support restock,
    repricing, repair, parts, supplier return, quarantine, mismatch, discard,
    and loss dispositions.
55. Require serial verification when applicable and quarantine discrepancies
    with factual evidence and an urgent dispute workflow.
56. Model replacement shipments and append-only refund, shipping, fee, and
    disposition financial events.
57. Present operational `Estimated profit` with clear provenance and a
    non-accounting disclaimer.
58. Include landed acquisition costs and direct selling/packaging/return costs,
    replace estimates with confirmed marketplace data, and exclude collected
    sales tax from revenue.
59. Defer general expenses, overhead, labor, mileage, and time tracking.
60. Make cost recovery and realized-versus-projected results central to pallet
    reporting, using both item and unit counts.
61. Preserve returned/refunded gross-sale history and retain detailed CSV and
    printable/PDF exports.
62. Use the agreed Act/Confirm/Never automation boundary and never allow AI to
    publish or materially change active listings without approval.
63. Include one launch Settings control that pauses outbound marketplace writes
    while preserving inbound safety data; defer advanced pause/resume controls.
64. Run idempotent background jobs with bounded automatic retries, manual retry,
    and persistent critical exceptions.
65. Remove production demo/test credentials and enforce the agreed session,
    token, storage, rate-limit, audit, and least-data security baseline.
66. Gate automation stages with feature flags and start outside beta users in
    Observe/Recommend mode with explicit quantity-protection opt-in.
67. Build in milestones but reserve `market-ready` for the complete standalone
    inventory and eBay inventory-to-return lifecycle.
68. Establish a hidden business ownership boundary at launch so future named
    users do not require reassignment of every operational record.
69. Keep interchangeable quantity on one card with authoritative movement and
    reservation ledgers; use unit records only for serialized or uniquely
    tracked goods, and repair cached balances when they disagree.
70. Preserve incomplete historic sold records as labeled `Legacy sale` history
    rather than fabricating order and fulfillment details.
71. Provide a guarded, idempotent one-time reconciliation for signed-in local
    inventory and keep disposable preview/demo data separate and resettable.
72. Suggest compatible duplicate merges without changing records automatically;
    an approved suggestion performs the merge while preserving both histories.
73. Treat differing AI price suggestions as a reviewed choice rather than an
    automatic reason to split or group inventory; if quantity is added, let the
    owner retain the current price or apply the new suggestion.

## Initial Product Validation

The first release is validated in two stages:

1. The owner buys and processes multiple real pallets through the complete
   capture, inventory, listing, sale, shipping, return-if-needed, and reporting
   workflow.
2. After the owner workflow succeeds reliably, invite additional hobbyist and
   small-business testers and measure their ability to complete the same flow
   without developer assistance.

External tester recruitment is not a substitute for completing the first
owner-operated end-to-end validation.

## Remaining Decisions Before Phase 1

The foundational product, workflow, automation, and data-model decisions are
now recorded. The remaining planning work is to approve end-to-end acceptance
scenarios and then order the implementation backlog by dependency and customer
value. A second automated marketplace remains intentionally evidence-gated and
is not a Phase 1 selection.

## Immediate Planning Deliverables

Before implementation, produce:

1. seller interview notes and a ranked problem inventory;
2. current-state and target-state workflow maps;
3. domain glossary and entity relationship diagram;
4. marketplace capability matrix;
5. automation risk matrix;
6. schema migration plan;
7. phased acceptance criteria and test strategy;
8. implementation backlog ordered by dependency and customer value.
