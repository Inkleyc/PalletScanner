# PalletScanner Mobile

Planned home for the Expo warehouse app.

The current Expo app still lives at the repo root while shared logic is being extracted into `packages/core`. Move it here after imports are clean enough that the path migration is mechanical.

Mobile responsibilities:

- Create/select active pallet.
- Scan barcodes.
- Capture item photos.
- Generate item drafts.
- Save inventory quickly.
- Move to the next item with minimal friction.

Avoid putting full business dashboards, bulk operations, and marketplace admin setup here.
