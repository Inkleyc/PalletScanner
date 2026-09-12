# PalletFlip

PalletFlip is a two-surface pallet resale operations system:

- Mobile app: fast warehouse capture for pallets, barcodes, photos, item drafts, and next-item workflows.
- Web app: business control for inventory review, listing queues, marketplace setup, pallet profitability, and reporting.

The mobile app is an Expo app under `apps/mobile`. The architecture split is happening on the `web-mobile-split` branch.

## Product Direction

Read the detailed roadmap:

- [Web and Mobile Split Gameplan](docs/web-mobile-split-gameplan.md)
- [Current Code Audit](docs/current-code-audit.md)
- [Mobile Testing And Expo Strategy](docs/mobile-testing-and-expo-strategy.md)
- [Backend Data Contract](docs/backend-data-contract.md)

## Workspace Commands

Install dependencies:

```bash
npm install
```

Start the mobile Expo app:

```bash
npm start
```

Start mobile web preview:

```bash
npm run web
```

Start the web business dashboard preview:

```bash
npm run dashboard:dev
```

Export a static mobile web build:

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

Run the main local checks:

```bash
npm run check
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

The Expo app has moved to `apps/mobile`. Shared business logic lives in `packages/core`, and `packages/api-client` owns the shared eBay backend client contract.

`apps/web` is now a React + Vite dashboard with overview metrics, clickable pallet health drill-ins, attention and listings queues, searchable/filterable/sortable inventory, filtered CSV export, an item detail panel, and eBay Admin Settings readiness checks. It uses a local repository adapter while we shape the desktop product and prepare the eventual shared backend.

Local app environment values should live in `apps/mobile/.env` for Expo commands. The root `.env` can remain for backend/server workflows.
