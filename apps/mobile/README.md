# PalletFlip Mobile

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
npm run lint
```

From this folder:

```bash
npm run start
npm run android
npm run ios
npm run lint
```

The Expo mobile-web demo is retired. Browser operations belong in
`apps/web`; this package targets the iOS and Android warehouse application.

Keep mobile app environment values in `apps/mobile/.env`.

## Android emulator safety

Copy `.env.emulator.example` to the ignored `.env.emulator.local` file and
replace its placeholders with a dedicated non-production Supabase project and
HTTPS backend. Validate it before creating an emulator build:

```bash
npm run mobile:emulator-check
```

The checker cannot identify the production Supabase project from source, so the
operator must confirm that the supplied project and backend are non-production.
Test Mode and demo inventory are intentionally rejected for cloud emulator
testing. Demo inventory can only seed in a development runtime when both Test
Mode and `EXPO_PUBLIC_ENABLE_DEMO_INVENTORY=true` are explicitly enabled; Test
Mode never authenticates cloud synchronization.

When signed in with Supabase, cloud inventory is authoritative and the local
inventory file acts as an offline cache. Pallets, items, and item photos sync to
the same account used by the web dashboard. Sync health is shown in Settings.
