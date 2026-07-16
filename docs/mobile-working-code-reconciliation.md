# Mobile Working Code Reconciliation

## Purpose

This note records how the current split mobile app was compared against the older working Expo app, and which old pieces should be reused versus redesigned.

## Baseline Compared

- Old working baseline: `main`, before the web/mobile package split.
- Old mobile entry points reviewed: `app/capture.tsx`, `app/scan-barcode.tsx`, root `app.json`, root `package.json`.
- Current split entry points reviewed: `apps/mobile/app/capture.tsx`, `apps/mobile/app/scan-barcode.tsx`, `apps/mobile/app.json`, `apps/mobile/package.json`, and shared helpers under `packages/core`.

## Honest Assessment

The old code should not be copied back wholesale. It bundled photo capture, barcode scanning, inventory save logic, and listing edit controls into one broad mobile screen. That made the early prototype productive, but it works against the current product direction: the phone app should stay focused on fast warehouse actions while the web app carries the heavier business workflows.

The old code still matters. The reliable pieces were its direct native action flow and scanner lifecycle:

- Camera buttons should open the native camera or library directly.
- Scanner cancel must reset both the visible scanner and the internal scan lock.
- A successful scan should close the scanner immediately.
- Lookup or AI failure should not trap the user; it should produce a saveable draft or a clear recovery path.
- The user should always have an obvious next action after scanning or taking photos.

## Decisions

- Keep the `apps/mobile` and `apps/web` split. This is the right architecture for a robust phone app plus fuller web dashboard.
- Keep separate mobile routes for photo capture and barcode scanning. Recombining them would make the phone app busier and less useful in warehouse work.
- Keep the newer shared helpers from `packages/core` and mobile draft builders. They make parsing, inventory item creation, and fallback behavior more consistent than the old screen-local logic.
- Keep the `expo-image-picker` app config in `apps/mobile/app.json`. The old app did not need the same split-package preview build setup.
- Preserve the old scanner lifecycle principles, but implement them inside the new scanner route.
- Treat offline and timeout fallback drafts as deliberate resilience, not as a replacement for real lookup. They keep work moving when a barcode service, AI key, or network call fails.
- Avoid automatic modals after a scan result. The result screen already has a visible `Take Listing Photos` action, and forced prompts can make the app feel frozen.

## Current Mobile Validation Checklist

Use this checklist on a real phone through Expo:

1. Restart the Expo bundle so the phone is not running stale JavaScript.
2. Create or select an active pallet.
3. Open `Capture Item`, tap `Take Photos`, and confirm the camera opens directly.
4. Tap `Upload Photos` and confirm the photo library opens or a visible permission/error message appears.
5. Open `Scan Barcode`, tap `Open Scanner`, scan a UPC/EAN, and confirm the scanner closes.
6. Confirm a draft appears within roughly 6 seconds, even if the online lookup cannot identify the product.
7. Tap `Cancel Scanner` and confirm the screen stays responsive.
8. After a result appears, tap `Take Listing Photos` and confirm the camera opens.
9. Save with `Save & Next Item` and confirm the next scan flow is ready.

## Remaining Native Risk

Terminal checks can validate TypeScript, linting, and web export behavior, but they cannot fully prove native camera/scanner behavior. The camera, photo library, and barcode scanner still need a real-device pass in Expo or a preview build.
