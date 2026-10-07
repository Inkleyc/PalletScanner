# eBay Server

This server handles eBay OAuth and listing creation for the Expo app so client secrets stay off the device.

For the full plain-English setup map, including local development versus distributed app architecture, see [docs/ebay-integration-guide.md](../docs/ebay-integration-guide.md).

## Endpoints

- `GET /health`
- `POST /ai/messages` securely proxies authenticated AI analysis requests.
- `GET /barcode/lookup?barcode=...` performs protected server-side product lookup for web scanners.
- `GET /ebay/status` returns backend configuration, seller connection, and the ready-to-list checklist.
- `GET /ebay/connect`
- `GET /ebay/connect-url`
- `GET /ebay/callback`
- `POST /ebay/listings`
- `POST /ebay/listings/end`
- `POST /ebay/disconnect`

## Required environment variables

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_RUNAME`
- `EBAY_MERCHANT_LOCATION_KEY`
- `EBAY_PAYMENT_POLICY_ID`
- `EBAY_RETURN_POLICY_ID`
- `EBAY_FULFILLMENT_POLICY_ID`

You can use [server/ebay.env.example](c:/Users/colto/PalletScanner/server/ebay.env.example) as a paste-in checklist when the developer portal is available again.

## Optional environment variables

- `EBAY_ENVIRONMENT=production`
- `EBAY_SERVER_PORT=8787`
- `EBAY_MARKETPLACE_ID=EBAY_US`
- `EBAY_CURRENCY=USD`
- `EBAY_LOCALE=en-US`
- `EBAY_CATEGORY_ID=1234`
- `EBAY_SCOPE=https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account`
- `PALLETSCANNER_AUTH_MODE=local`
- `PALLETSCANNER_JWT_SECRET=...`
- `EBAY_TOKEN_ENCRYPTION_KEY=...`
- `PALLETSCANNER_ALLOWED_ORIGIN=https://app.example.com`
- `PALLETSCANNER_LISTING_RATE_LIMIT_PER_MINUTE=20`
- `ANTHROPIC_API_KEY=...`
- `ANTHROPIC_MODEL=claude-sonnet-5`
- `PALLETSCANNER_AI_RATE_LIMIT_PER_MINUTE=10`

## Setup notes

1. In the eBay developer portal, create or edit your RuName so its accept URL points to your backend callback route.
   - Local example: `http://192.168.1.42:8787/ebay/callback`
   - Deployed example: `https://your-server.example.com/ebay/callback`
2. Put the returned `RuName` value into `EBAY_RUNAME`.
3. Set `EXPO_PUBLIC_EBAY_API_BASE_URL` in the app environment to that same backend base URL.
   - For local device testing, use your computer's LAN IP, not `localhost`.
4. Add the merchant location key and the three business policy IDs to your `.env`.
5. Start the server with `npm run ebay-server`.
6. In mobile Settings or web Admin Settings, use the eBay connect button to authorize the seller account.
7. Confirm `/ebay/status` reports `readyToList: true` before relying on direct posting.

## Fastest recovery plan when eBay is accessible again

1. Fill the blank values in [server/ebay.env.example](c:/Users/colto/PalletScanner/server/ebay.env.example).
2. Copy those values into your root `.env`.
3. Start the backend with `npm run ebay-server`.
4. Open `http://YOUR-IP:8787/ebay/status` or use web Admin Settings to check the readiness list.
5. In the app or web dashboard, connect the eBay seller account.
6. Confirm the status says ready to list.
7. Test creating one listing from an inventory item.

## Important

- Leave `EBAY_CATEGORY_ID` blank to use dynamic Taxonomy suggestions.
- Listing creation depends on valid business policy IDs and an inventory location.
- Production defaults to JWT authentication and requires encrypted token storage.
- See [docs/ebay-production-runbook.md](../docs/ebay-production-runbook.md).
