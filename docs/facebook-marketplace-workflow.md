# Facebook Marketplace Workflow

PalletScanner uses an assisted Facebook Marketplace flow. It prepares the listing,
opens Marketplace, tracks draft/listed state, and keeps the exact fields ready to
copy.

## What The App Does

1. Builds Facebook-specific title and description during item capture.
2. Saves item photos with the inventory record.
3. Copies a complete Facebook listing summary to the clipboard.
4. Opens Facebook Marketplace's create-item screen when the device supports it.
5. Shows quick copy actions for:
   - Title
   - Price
   - Description
   - Condition
   - Quantity
   - Photo checklist
   - Full listing text
6. Marks the item as `Facebook draft opened` until the seller taps
   `Mark Facebook Listed`.
7. Runs a batch helper from Inventory summary for every item in the current view
   that is not yet marked listed to Facebook.
8. Saves a published Facebook listing URL so the seller can reopen the listing
   from the inventory card.
9. Appends the saved Facebook seller note from Settings to every Marketplace
   description.
10. Provides a dedicated Facebook Queue tab for posting one item at a time.

This avoids accidentally treating an unfinished Marketplace draft as a completed
listing.

## Copy Behavior

PalletScanner cannot autofill Facebook Marketplace fields directly. Facebook
does not expose a reliable personal Marketplace create-listing API or field-fill
intent for third-party apps.

The app supports two copy modes:

- `Copy All`: puts the full prepared listing on the clipboard. This is useful
  for pasting into description or notes.
- Field buttons: copy the exact value for a single Marketplace field, such as
  title, price, description, condition, quantity, or the photo checklist.

Use the field buttons when Facebook asks for a specific form field. Use `Copy
All` only when you want the full package in one paste.

## Facebook Account

Facebook Marketplace uses the account currently active in the Facebook app or
browser. PalletScanner cannot force Facebook to post under a different personal
account.

Settings includes Facebook account shortcuts:

- `Open Facebook Login`
- `Open Selling Page`

Use these before posting if the device needs to switch Facebook accounts.

## Facebook Queue

The Facebook Queue tab is the friendliest posting path. It shows one unposted
item at a time and guides the seller through:

1. Fixing blockers like missing photos or missing price.
2. Copying each Marketplace field.
3. Opening Facebook Marketplace.
4. Publishing in Facebook.
5. Marking the item listed in PalletScanner.
6. Saving the final Facebook listing URL.

The queue exists because Facebook does not allow PalletScanner to submit a
personal Marketplace listing in the background. Instead, the app makes the manual
steps obvious and repeatable.

## Current Limits

Facebook does not provide a normal public API for creating personal Marketplace
listings from a third-party app. Because of that, PalletScanner should not try to
silently auto-post to Marketplace.

The supported production path is:

```text
Scan item -> prepare copy/photos -> open Marketplace -> paste fields -> publish -> mark listed
```

For a deeper Meta integration later, the likely path is Meta Commerce Manager,
catalogs, and Graph API review. That is a business/shop catalog workflow, not the
same as personal Marketplace posting, and it would require a separate product
decision.

## Next Improvements

- Add a photo gallery action that lets the seller save/share selected item photos
  right before opening Marketplace.
- Add location/pickup templates for common seller scenarios.
- Add a Facebook draft review screen that groups unfinished drafts, missing URLs,
  and items with no photos.
