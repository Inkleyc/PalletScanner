# PalletScanner Web and Mobile Split Gameplan

## End Goal

Build PalletScanner as two focused products on one shared business system:

- A mobile app for warehouse action: scan, photograph, identify, sort, and move inventory quickly.
- A web app for business control: review inventory, manage listings, track profitability, configure marketplaces, and understand what needs attention.

The product should feel purpose-built for pallet operators. The phone app should be narrow, fast, and reliable in the warehouse. The web app should be dense, clear, and useful for running the business.

## Product Principle

Do not make the phone app a smaller version of the web app.

The phone app should answer: "What do I do with this item right now?"

The web app should answer: "How is the business doing, and what needs my decision?"

Both apps should share the same backend data, permissions, item states, marketplace integrations, and activity history.

## Recommended Strategy

Create a dedicated branch and reshape the current codebase instead of starting from zero.

Suggested branch:

```bash
git checkout -b web-mobile-split
```

Keep the current main branch as the known working baseline. The current repo already contains useful domain work around pallets, listings, settings, eBay, Facebook workflow, Supabase setup, and inventory behavior. We should keep that value while changing the architecture so the codebase can support the product we actually want.

## Target Repo Shape

Long-term structure:

```text
apps/
  mobile/
    Expo app for scanning, photos, intake, and warehouse workflows
  web/
    Web-first business dashboard and operations app
packages/
  core/
    Shared types, item status rules, pallet math, validation, and domain helpers
  api-client/
    Shared client for Supabase/API calls used by mobile and web
server/
  Marketplace auth, eBay helpers, webhook handlers, and backend-only jobs
docs/
  Product plans, setup guides, integration runbooks, and launch checklists
```

This gives us separation without losing reuse. The UI layers can evolve independently, while shared business logic stays consistent.

## Functional Split

### Mobile App

Primary job: capture work as it happens.

Core workflows:

- Scan pallet, item, SKU, or barcode.
- Create inventory items quickly.
- Take and attach photos.
- Add condition, category, quantity, and quick notes.
- Assign shelf/bin/location.
- Move items through operational statuses.
- Generate draft title/description suggestions.
- Continue immediately to the next item.
- Show only the listing/business fields needed in the moment.

Mobile should avoid:

- Large dashboards.
- Complex settings.
- Bulk spreadsheet-like editing.
- Deep analytics.
- Marketplace account setup.
- Dense reporting.

### Web App

Primary job: manage decisions, quality, and business performance.

Core workflows:

- Inventory table with filtering, sorting, search, and bulk actions.
- Pallet overview with cost, estimated value, listed value, sold value, and margin.
- Listing review queue for eBay/Facebook/other marketplaces.
- Item cleanup queue for missing photos, missing prices, weak titles, or stale statuses.
- Marketplace connection/settings area.
- Pricing and comps workspace.
- Team/user activity view.
- Reporting dashboard for revenue, margin, sell-through, and aging inventory.
- Export tools for accounting or operational review.

Web should avoid:

- Camera-first flows.
- One-item-at-a-time warehouse capture as the primary interface.
- Forcing mobile constraints onto desktop workflows.

## Shared Business Model

The shared model should become the product backbone.

Important entities:

- User
- Organization/business
- Pallet
- Inventory item
- Item photo
- Location/bin/shelf
- Listing draft
- Marketplace listing
- Marketplace account/connection
- Sale/order
- Expense/cost
- Activity event

Important item states:

- Received
- Needs photos
- Needs research
- Ready for listing
- Drafted
- Listed
- Sold
- Packed
- Shipped
- Returned
- Discarded

Important pallet metrics:

- Purchase cost
- Item count
- Estimated gross value
- Listed value
- Sold value
- Fees
- Shipping cost
- Net profit
- Margin percentage
- Sell-through rate
- Average days to list
- Average days to sell

## Phased Roadmap

### Phase 1: Architecture Inventory

Goal: understand what should be kept, moved, rewritten, or discarded.

Tasks:

- Identify all current screens and classify them as mobile, web, shared, or obsolete.
- Identify all shared domain logic currently living inside UI files.
- Review current inventory store/data model.
- Review eBay/Facebook integration code and decide what belongs in server/shared packages.
- Document current environment variables and backend assumptions.
- Create a migration checklist from current structure to target structure.

Deliverable:

- A written inventory of current code ownership.
- A first version of the target folder structure.

### Phase 2: Branch and Baseline Cleanup

Goal: create a safe place to make structural changes.

Tasks:

- Create the `web-mobile-split` branch.
- Confirm the app still builds before moving files.
- Update README with the new product direction.
- Keep existing docs, integration notes, and runbooks.
- Add basic scripts for the new workspace shape.

Deliverable:

- Branch exists.
- Baseline build is known.
- Repo direction is documented.

### Phase 3: Extract Shared Core

Goal: pull business logic out of UI so both apps can use it.

Tasks:

- Create `packages/core`.
- Move shared types into core.
- Move item status definitions into core.
- Move pallet metric calculations into core.
- Move listing readiness checks into core.
- Add simple tests for core calculations and status transitions.

Deliverable:

- Mobile and future web can import shared pallet/item/listing logic.
- Business rules stop being duplicated in screens.

### Phase 4: Stabilize Mobile As The Warehouse App

Goal: make the existing Expo app focus on warehouse action.

Tasks:

- Move current Expo app toward `apps/mobile`.
- Keep capture, scan, pallets, settings needed for mobile operation.
- Simplify mobile navigation around active workflows.
- Add a fast "next item" loop.
- Make item creation/editing efficient with minimal typing.
- Keep the phone inventory view focused on the active pallet by default.
- Hide business/admin tools behind secondary controls on phone layouts.

Progress:

- The repo now uses the `apps/mobile`, `apps/web`, and `packages/core` workspace shape.
- Capture and barcode flows have a save-and-next loop for faster item intake.
- Photo capture no longer carries the barcode scanner path.
- Analytics, Facebook queue, and deeper listing tools are no longer primary mobile tab destinations.
- Settings remains a primary mobile destination because tester login, eBay connection, account status, and posting preferences need to be reachable on the device.
- Mobile Settings should stay limited to account connection and posting behavior. Usage/billing, developer tokens, destructive data controls, and organization/admin settings belong in the web dashboard or internal tooling.
- Mobile Inventory follows the active pallet on phone layouts while large layouts can still use all-inventory review.
- Pallet rename, cost, and delete controls are tucked behind "Manage pallet" on phone layouts.
- Shared core now owns item/listing status helpers, metrics/report helpers, parsers, and capture analysis result typing.
- `apps/web` now has a dependency-free dashboard scaffold for the future desktop operations app.
- `packages/api-client` now owns the shared eBay backend client contract used by mobile and ready for future web use.
- eBay status now separates backend configuration, seller account connection, and ready-to-list requirements.
- Mobile Settings shows a short eBay readiness summary while web Admin Settings shows the fuller backend connection checklist.
- The web inventory table now supports search, status/platform filters, sortable columns, filtered CSV export, and an empty-filter state.
- The web inventory table now supports pallet filtering, clickable pallet drill-ins, and a selected-pallet context summary.
- The web inventory view persists filters/sort, has a reset control, supports keyboard-selectable rows, and includes a selected-item detail panel.
- The web attention queue can drill into the selected inventory item.
- The web attention and marketplace queues now show clear empty states when no work is waiting.
- The web dashboard now has an aging queue for stale unsold inventory, an actionable stale-items metric, and an age column in inventory/export.
- The mobile first tab is labeled around the user's real action, Scan, instead of a generic Home label.
- Mobile first-pallet creation can continue directly into the scan/capture workflow the user originally tapped.
- Mobile pallet cards now show item count, sold count, and cost so users can choose the right active pallet faster.
- Mobile Settings explains how app login relates to eBay account connection and shows the backend auth mode when available.
- The root workspace check now includes backend syntax validation.
- Keep marketplace posting limited to safe, guided actions.
- Remove or de-emphasize dashboard-heavy screens from mobile.

Deliverable:

- Mobile app has a clear operational identity.
- Warehouse users can receive and process inventory quickly.

### Phase 5: Create Web App Shell

Goal: create the business dashboard as a web-first app.

Recommended direction:

- Use a web-first React framework instead of relying on Expo web for the business dashboard.
- Start with a simple app shell: sidebar navigation, dashboard area, inventory area, listings area, settings area.

Tasks:

- Create `apps/web`.
- Add routes for dashboard, inventory, pallets, listings, analytics, and settings.
- Connect to shared `packages/core`.
- Connect to the same backend/API client as mobile.
- Build a first useful inventory table.

Deliverable:

- Web app can load real/shared data and show inventory in a desktop-friendly layout.

### Phase 6: Backend and Data Source Of Truth

Goal: ensure both clients read/write the same system cleanly.

Tasks:

- Confirm Supabase schema or backend data model.
- Define ownership for writes: what mobile can write, what web can write, what server alone can write.
- Add activity logging for important changes.
- Make photo storage and item records consistent.
- Keep marketplace credentials and secrets server-side.
- Add server endpoints or functions where client-side writes would be unsafe.

Deliverable:

- Shared data model supports both apps.
- Marketplace and sensitive operations stay protected.

### Phase 7: Listing Operations

Goal: make listing workflows reliable and reviewable.

Tasks:

- Define listing readiness rules.
- Create a web listing review queue.
- Keep mobile draft generation simple.
- Move final review, bulk cleanup, and marketplace settings to web.
- Track listing failures and retry states.
- Preserve eBay/Facebook integration docs and update them as implementation changes.

Deliverable:

- Items can move from warehouse capture to reviewed marketplace listings without losing state.

### Phase 8: Business Metrics and Reporting

Goal: make the web app valuable to the business owner.

Tasks:

- Add pallet-level profitability.
- Add inventory aging.
- Add sell-through tracking.
- Add revenue/cost/margin summaries.
- Add stale inventory and exception queues.
- Add exportable reports.

Deliverable:

- Web app becomes the place to understand what is making money and what is stuck.

### Phase 9: Polish Operational Reliability

Goal: make the system dependable in real warehouse use.

Tasks:

- Improve loading and empty states.
- Add error handling around camera, upload, and marketplace actions.
- Add offline or poor-connection strategy for mobile.
- Add role-based permissions if multiple workers use the app.
- Add audit history for important changes.
- Add backups/export paths for critical data.

Deliverable:

- The app can survive normal warehouse messiness without losing trust.

## First Buildable Milestones

### Milestone 1: Decision Branch

- Create `web-mobile-split`.
- Add roadmap docs.
- Confirm current build status.

### Milestone 2: Current Code Audit

- Map screens to mobile/web/shared/obsolete.
- Identify shared logic candidates.
- Identify data model gaps.

### Milestone 3: Shared Core Package

- Add shared item/pallet/listing types.
- Add status model.
- Add metric helpers.

### Milestone 4: Mobile Focus Pass

- Make mobile navigation warehouse-first.
- Improve item intake and next-item flow.
- Reduce dashboard/admin weight on phone.

### Milestone 5: Web App Shell

- Add web app.
- Show inventory and pallet dashboard.
- Connect to shared model.

## Risks

### Risk: Rebuilding Too Much At Once

Avoid a giant rewrite where nothing works for weeks. Move in phases and keep the current working app as a reference.

### Risk: Two Apps With Divergent Logic

If mobile and web each define statuses, metrics, or listing rules separately, the product will become inconsistent. Shared core logic is not optional.

### Risk: Mobile Becomes An Admin App

The phone app should not become a cramped dashboard. Keep it action-first.

### Risk: Web Becomes A Stretched Mobile App

The business app should use desktop patterns: tables, filters, review queues, dense summaries, and bulk actions.

### Risk: Marketplace Logic Leaks Into Clients

Credentials, token refresh, listing submission, and webhooks should stay server-side where possible.

## Technical Decisions To Make

- Which web framework to use for `apps/web`.
- Whether to use npm workspaces, pnpm, or another workspace manager.
- Whether current Supabase schema is enough or needs a redesign.
- How photos are stored and linked across mobile and web.
- How offline mobile work should sync.
- Which marketplace actions are allowed from mobile versus web.
- Whether listing review requires approval before publishing.

## Recommended Next Step

Start with an architecture audit on a new branch. The audit should produce a file-by-file map:

- Keep in mobile.
- Move to web.
- Move to shared core.
- Move to server.
- Delete or replace later.

After that, extract shared core before building the new web app. That order keeps us from creating two separate products that only appear to share data.
