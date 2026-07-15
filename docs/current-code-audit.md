# Current Code Audit For Web/Mobile Split

This audit captures the current repo shape before moving files. It is meant to guide the first migration passes on the `web-mobile-split` branch.

## Summary

The current app is a single Expo Router application with mobile, web, admin, and marketplace workflows mixed together. The good news is that the domain is already visible: pallets, inventory items, listing drafts, marketplace statuses, pallet costs, sold prices, and posting readiness all exist.

The main issue is placement. A lot of business logic currently lives inside React Native screens or platform-specific helpers. The next architecture step is to move shared types, status rules, posting readiness, and pallet metrics into `packages/core` before splitting the UI into `apps/mobile` and `apps/web`.

## Current File Ownership Map

### Keep In Mobile

- `app/index.tsx`: app entry/onboarding redirect.
- `app/onboarding.tsx`: mobile onboarding.
- `app/capture.tsx`: photo-first item capture workflow.
- `app/scan-barcode.tsx`: barcode-first item capture workflow.
- `app/(tabs)/index.tsx`: mobile home/active pallet start screen.
- `components/loading-status.tsx`: useful mobile capture feedback.
- `components/photo-reference-cards.tsx`: useful while improving capture/listing quality.
- `hooks/*`: keep with mobile until web has its own styling/runtime needs.

### Move Or Rebuild For Web

- `app/(tabs)/explore.tsx`: current inventory screen is doing web-like work already: filtering, sorting, export, bulk posting, sold status, listing URL cleanup, and bundle suggestions. Rebuild this as a dense web inventory table, while keeping only a simplified mobile inventory view if needed.
- `app/(tabs)/analytics.tsx`: mostly web dashboard/reporting logic. Move calculations into core and rebuild UI in the web app.
- `app/(tabs)/settings.tsx`: split. Marketplace setup, auth token handling, eBay status, Supabase login, and destructive data controls belong primarily in web/admin. A small mobile settings screen can keep only device/account essentials.
- `app/(tabs)/facebook.tsx`: the review queue is closer to a web operations workflow, but a limited mobile version may remain for one-at-a-time posting.

### Shared Core Candidates

- `lib/inventory-store.ts`: contains shared domain types and normalization rules, but it also owns Expo file storage, web storage, subscriptions, and persistence. Extract types and pure rules first; leave persistence in the app/API layer.
- `lib/posting-validation.ts`: strong candidate for `packages/core`. It is already pure except for importing `InventoryItem` from the app store.
- `lib/listing-drafts.ts`: strong candidate for `packages/core`.
- Pallet metric calculations currently inside `app/(tabs)/analytics.tsx`.
- Inventory filter/listing queue rules currently inside `app/(tabs)/explore.tsx` and `app/(tabs)/facebook.tsx`.

### Keep In Server

- `server/*`: eBay OAuth, token storage, auth, production checks, and backend-only marketplace work.
- `Dockerfile.ebay`, `docker-compose.ebay*.yml`, `render.yaml`: backend deployment/runtime assets.

### Keep As Integration Docs

- `docs/ebay-integration-guide.md`
- `docs/ebay-production-runbook.md`
- `docs/facebook-marketplace-workflow.md`
- `docs/production-launch-checklist.md`
- `docs/supabase-setup-guide.md`

## Domain Objects Found

Current core objects in `lib/inventory-store.ts`:

- `InventoryItem`
- `PalletSession`
- `ResetBackup`
- `ResetBackupSummary`
- `InventoryPersistence`

Current marketplace/status fields:

- `listedPlatforms`
- `ebayStatus`
- `ebayListingId`
- `ebayListingUrl`
- `ebaySku`
- `ebayOfferId`
- `ebayCategoryId`
- `ebayCategoryName`
- `ebayProgress`
- `ebayLastError`
- `facebookStatus`
- `facebookListingUrl`
- `facebookLastError`

Current metric fields:

- `palletCost`
- `low_price`
- `high_price`
- `floor_price`
- `quantity`
- `soldPrice`

## Important Refactor Findings

### Capture/Scan Screens Are Too Large

`app/capture.tsx` and `app/scan-barcode.tsx` include UI, camera flow, prompt construction, Anthropic calls, barcode lookup handling, listing draft mapping, price parsing, quantity parsing, and inventory saving in one screen.

Recommended split:

- UI screen stays in mobile.
- Prompt/request building moves to an item analysis service.
- Result parsing and draft creation move to shared/domain helpers.
- Price and quantity parsing move to core.
- Inventory writes move behind a repository/API client.

### Inventory Screen Is Doing Web-App Work

`app/(tabs)/explore.tsx` is effectively an operations console: filters, search, exports, sold price edits, listing statuses, bulk eBay/Facebook flows, and bundle suggestions. This should become the seed for the web inventory dashboard.

Recommended split:

- Web: full inventory table, filters, exports, listing queue, bulk actions.
- Mobile: limited item list and quick status edits only if useful in the warehouse.

### Analytics Logic Should Be Pure Core

`app/(tabs)/analytics.tsx` computes useful pallet and inventory metrics directly in the component. These calculations should move to core so both web and mobile can use the same definitions.

### Settings Needs Product Separation

`app/(tabs)/settings.tsx` mixes mobile device settings, app auth, marketplace admin setup, token testing, and data reset controls.

Recommended split:

- Mobile settings: signed-in user, device permissions/help, basic capture preferences.
- Web settings: marketplace connections, auth/admin controls, organization settings, destructive data actions.

## First Extraction Targets

1. Move shared types to `packages/core/src/domain.ts`.
2. Move listing draft helpers to `packages/core/src/listing-drafts.ts`.
3. Move posting readiness to `packages/core/src/posting-readiness.ts`.
4. Move pallet/inventory metrics to `packages/core/src/metrics.ts`.
5. Add compatibility re-exports from current `lib/*` files only after the package imports are wired.

## Do Not Move Yet

- Expo Router app directories.
- Native camera/photo code.
- File persistence code.
- eBay backend/server code.
- Supabase auth code.

Those should move after shared core is stable.

## Next Implementation Steps

1. Keep building on `web-mobile-split`.
2. Wire the current app to import pure helpers from `packages/core`.
3. Run lint/build after each extraction.
4. Move the Expo app to `apps/mobile` only after imports are clean.
5. Create `apps/web` after the shared model is usable.

## Progress Notes

- The Expo app has been moved under `apps/mobile`.
- Shared business types and helpers have started moving into `packages/core`.
- The mobile tab bar is focused on field work while still keeping Settings visible for marketplace login, account status, and tester support.
- Mobile Settings has been trimmed to device-relevant account and posting controls: eBay connection, app login, posting preference, Facebook account shortcuts, and Facebook note defaults.
- Pro/usage messaging, runtime bearer token entry, and destructive delete-all-data controls should move to web/admin or internal tooling instead of the normal phone Settings surface.
- Inventory now defaults phone users toward the active pallet instead of broad all-inventory review.
- Pallet management details are secondary on phone layouts, with rename/cost/delete behind a manage toggle.
- `apps/web` now contains an initial static dashboard scaffold for overview metrics, pallet health, an attention queue, and an inventory review table.

## Updated Near-Term Recommendation

Continue reducing the mobile app to capture, active pallet review, quick status edits, and one-at-a-time listing support. Treat exports, profit analysis, marketplace setup, bulk posting, bundle suggestions, and account/admin controls as web-dashboard work unless there is a clear warehouse need for them on the phone.
