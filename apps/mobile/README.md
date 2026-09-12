# PalletScanner Mobile

Expo warehouse app for capture, scanning, photos, and fast item intake.

Mobile responsibilities:

- Create/select active pallet.
- Scan barcodes.
- Capture item photos.
- Generate item drafts.
- Save inventory quickly.
- Move to the next item with minimal friction.

Avoid putting full business dashboards, bulk operations, and marketplace admin setup here.

## Commands

From the repo root:

```bash
npm start
npm run android
npm run ios
npm run web
npm run lint
```

From this folder:

```bash
npm run start
npm run android
npm run ios
npm run web
npm run lint
```

Keep mobile app environment values in `apps/mobile/.env`.

When signed in with Supabase, cloud inventory is authoritative and the local
inventory file acts as an offline cache. Pallets, items, and item photos sync to
the same account used by the web dashboard. Sync health is shown in Settings.
