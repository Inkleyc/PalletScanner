# Web Flow Audit

## Product Job

The web app is the business-control surface. It should answer two questions:

1. What needs a decision now?
2. How is the resale operation performing?

Warehouse intake remains in the phone app. The dashboard reviews and corrects
captured inventory, manages listing work, records outcomes, and explains
performance.

## Primary Flow

1. **Overview** summarizes the operation and points to the next decisions.
2. **Review** is the focused workspace for decisions and item-level actions.
3. **Inventory** is the full-width master record for search, filtering, bulk changes, and export.
4. **Pallets** manages purchase cost, profitability context, and the phone's scan target.
5. **Data / Analysis** evaluates sales, margin, sell-through, and channel performance.
6. **Settings** contains account connections, marketplace setup, backups, and activity history.

## Changes From The Audit

- Removed desktop item intake from the global header. New items originate in the
  phone's scan or photo flow.
- Separated Review from Inventory after testing the combined workspace. Review
  owns item decisions and actions; Inventory owns master-data management and is
  the only place where item fields are edited.
- Review and Inventory now open the same item-record popup so photos, listing
  details, and editing are not duplicated across two different surfaces.
- Review excludes sold and ready inventory. It contains only unresolved
  decisions, publishing failures, and aging items that still need attention.
- Removed Sold from the listing pipeline. Completed sales belong in Analysis.
- Reduced Overview to six pallet-scoped performance signals. Users can switch
  between all pallets and one specific pallet without duplicating the Work Queue.
- Moved Activity under Settings because it supports troubleshooting and auditing,
  rather than day-to-day navigation.
- Clarified that the active pallet is the phone's scan target.
- Standardized existing-record edits as read-only views with focused edit dialogs.

## Keep Out Of The Web App

- Camera and barcode capture.
- A prominent one-item-at-a-time intake loop.
- Phone-only posting preferences.
- Duplicate dashboards or navigation destinations for the same decision.
