# PalletFlip Product Charter
Status: Product direction confirmed by owner; this written formulation is the handoff baseline. Material amendments require owner approval.

## Purpose
PalletFlip is a mobile-first resale operations platform for individuals and small resale businesses. It helps acquire and organize pallet and loose-item inventory, capture and research items, prepare marketplace listings, manage sales and fulfillment, process returns, and understand profitability.

## Distinct surfaces
**Mobile** is for rapid warehouse action: choose a pallet, scan barcodes, capture photos, identify/draft items, save quickly, and move to the next item. Make failure recovery and offline handling dependable. Avoid dense reporting, bulk administration and complex marketplace setup.

**Web** is for business control: Overview, Review, Inventory, Pallets, Data / Analysis and Settings; decisions, inventory record editing, listing readiness, marketplace operations, order/fulfillment/returns management, profitability, reporting and exports. Avoid replicating phone-first scanning/capture as the main desktop workflow.

**Shared system** provides authenticated business data, permissions, item and listing states, photos, synchronization, activity history, and secure backend marketplace integration.

## Design/workflow principles
- Do not make mobile a miniature web dashboard.
- Mobile answers “What do I do with this item right now?”
- Web answers “How is the business doing, and what needs my decision?”
- Preserve existing navigation and established workflow intent.
- Web Review owns decision queues; Inventory owns master-record edits; Pallets owns pallet context and phone scan target, as documented in `docs/web-flow-audit.md`.
- Preserve mobile/web split, shared domain logic, and reliable user data.

## Priority and boundaries
**Now:** finish current functionality, usability, design consistency, security and reliability across mobile/web.
**Later:** demo/TestFlight/release infrastructure, monetization, and AI reactivation unless specifically scoped/approved.
**Not automatically authorized:** unrelated products, new sales channels, major navigation changes, unapproved feature expansion, Facebook auto-posting claims, production deployments or live customer operations.

## Product completion
An operator should be able to capture and manage inventory on mobile, make operational decisions on web, use supported listing/fulfillment/return workflows, and trust consistent inventory and financial state. Evidence and manual acceptance matter more than claims of completeness.
