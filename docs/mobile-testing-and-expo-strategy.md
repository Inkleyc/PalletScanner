# Mobile Testing And Expo Strategy

## Recommendation

Keep Expo for the mobile app.

Expo is a good fit for PalletScanner's phone surface because the mobile app needs camera access, barcode scanning, photo capture, file handling, haptics, deep links, and fast iteration. Rebuilding the mobile app in plain native iOS/Android or bare React Native would add setup and release overhead before the product needs it.

The important distinction is this:

- Do not rely on Expo Go as the serious tester path.
- Use Expo development builds and EAS internal distribution for real testing.

## Why Expo Still Fits

The phone app should be narrow and hardware-oriented:

- Scan barcodes.
- Take photos.
- Capture item condition and notes.
- Save items to the active pallet.
- Work quickly in a warehouse setting.

Expo handles that well, and the current repo already uses Expo-native pieces such as:

- `expo-camera`
- `expo-image-picker`
- `expo-file-system`
- `expo-haptics`
- `expo-linking`
- `expo-router`

Moving away from Expo now would slow down the product without solving the main architecture problem. The main problem is not Expo; the main problem is that mobile, web, admin, and shared business logic are currently living in one app shape.

## Testing Options

### 1. Development Builds

Best for: you and trusted early testers who need a realistic app build during development.

Development builds include `expo-dev-client` and let us test a real native app instead of Expo Go. This matters for production-grade behavior, native config, app icon/splash changes, linking, camera behavior, and libraries that Expo Go cannot fully represent.

### 2. EAS Internal Distribution

Best for: private tester builds before app store release.

The current `eas.json` already has internal distribution profiles:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

This is the right setup direction.

Android is straightforward: EAS preview builds can create APK files that testers can install from a shared build URL after accepting Android's install warning.

iOS is more controlled: ad hoc internal builds require a paid Apple Developer account and registered tester device UDIDs. For broader iOS testing, TestFlight is usually the better path once the app is ready enough.

### 3. TestFlight And Google Play Testing

Best for: wider beta testing.

Eventually:

- Use TestFlight for iPhone testers.
- Use Google Play internal/closed testing for Android testers.

This is more formal than internal distribution, but smoother for testers once configured.

## Where Expo Is Not The Best Fit

Expo should not be the long-term business dashboard framework.

The web app needs dense desktop workflows:

- inventory tables
- filtering and sorting
- bulk actions
- listing review queues
- reports
- marketplace/admin settings
- profitability dashboards

Those should be built as a web-first app under `apps/web`, not as Expo web stretched into a desktop operations tool.

## Practical Direction

Use:

- Expo + EAS for `apps/mobile`
- Web-first React app for `apps/web`
- Shared `packages/core` for business logic
- Shared API/backend layer for data access

This gives us fast mobile development, real tester distribution, and a proper desktop business app.

## Build Commands

Run these from the repo root.

Local browser preview:

```bash
npm run web -w @palletscanner/mobile
```

Android internal APK preview:

```bash
npm run mobile:build:android-preview
```

iOS internal preview:

```bash
npm run mobile:build:ios-preview
```

Development build:

```bash
npm run mobile:build:development
```

Before sharing a tester build, run:

```bash
npm run check
npm run supabase:app-check
```

For eBay posting tests, also verify the backend health and `/ebay/status` readiness checklist before inviting testers to connect accounts.

## Near-Term Action Items

1. Keep the existing Expo app as the mobile app.
2. Use the existing EAS scripts for preview/development builds.
3. Keep Android preview builds as the fastest tester path.
4. Document iOS tester requirements before inviting iPhone testers.
5. Move business dashboard work to the planned web app instead of expanding Expo web.
