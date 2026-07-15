# PalletScanner

PalletScanner is evolving into a two-surface pallet resale operations system:

- Mobile app: fast warehouse capture for pallets, barcodes, photos, item drafts, and next-item workflows.
- Web app: business control for inventory review, listing queues, marketplace setup, pallet profitability, and reporting.

The current app is an Expo app. The next architecture pass is happening on the `web-mobile-split` branch.

## Product Direction

Read the detailed roadmap:

- [Web and Mobile Split Gameplan](docs/web-mobile-split-gameplan.md)
- [Current Code Audit](docs/current-code-audit.md)
- [Mobile Testing And Expo Strategy](docs/mobile-testing-and-expo-strategy.md)

## Current App Commands

Install dependencies:

```bash
npm install
```

Start the Expo app:

```bash
npm start
```

Start web preview:

```bash
npm run web
```

Export a static web build:

```bash
npm run web:export
```

Create an Android preview build for testers:

```bash
npm run mobile:build:android-preview
```

Create an iOS preview build for registered test devices:

```bash
npm run mobile:build:ios-preview
```

Run lint:

```bash
npm run lint
```

## Planned Repo Shape

```text
apps/
  mobile/      Expo warehouse app
  web/         Web-first business dashboard
packages/
  core/        Shared pallet, item, listing, and metric logic
  api-client/  Shared backend/API client
server/        Marketplace auth, eBay helpers, and backend-only jobs
docs/          Product plans, setup guides, and runbooks
```

## Current Status

The current root app still runs as a single Expo project. The first split work should extract shared domain logic into `packages/core`, then move the existing Expo app into `apps/mobile`, and then create `apps/web` for the business dashboard.
