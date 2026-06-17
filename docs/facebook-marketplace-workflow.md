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
   - Full listing text
6. Marks the item as `Facebook draft opened` until the seller taps
   `Mark Facebook Listed`.
7. Runs a batch helper from Inventory summary for every item in the current view
   that is not yet marked listed to Facebook.
8. Saves a published Facebook listing URL so the seller can reopen the listing
   from the inventory card.

This avoids accidentally treating an unfinished Marketplace draft as a completed
listing.

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
- Add filters for `Facebook draft opened` so unfinished Marketplace posts are easy
  to clean up.
- Add a reminder prompt after `Mark Facebook Listed` to paste the final listing
  URL before moving on.
