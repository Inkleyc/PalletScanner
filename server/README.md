# eBay Server

This server handles eBay OAuth and listing creation for the Expo app so client secrets stay off the device.

## Endpoints

- `GET /health`
- `GET /ebay/status`
- `GET /ebay/connect`
- `GET /ebay/connect-url`
- `GET /ebay/callback`
- `POST /ebay/listings`

## Required environment variables

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_RUNAME`
- `EBAY_MERCHANT_LOCATION_KEY`
- `EBAY_PAYMENT_POLICY_ID`
- `EBAY_RETURN_POLICY_ID`
- `EBAY_FULFILLMENT_POLICY_ID`

## Optional environment variables

- `EBAY_ENVIRONMENT=production`
- `EBAY_SERVER_PORT=8787`
- `EBAY_MARKETPLACE_ID=EBAY_US`
- `EBAY_CURRENCY=USD`
- `EBAY_LOCALE=en-US`
- `EBAY_CATEGORY_ID=1234`
- `EBAY_SCOPE=https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account`

## Setup notes

1. In the eBay developer portal, create or edit your production RuName so its accept URL points to your deployed backend callback route, for example `https://your-server.example.com/ebay/callback`.
2. Set `EXPO_PUBLIC_EBAY_API_BASE_URL` in the app environment to that same backend base URL.
3. Start the server with `npm run ebay-server`.
4. In the app Settings tab, use the eBay connect button to authorize the seller account.

## Important

- Sandbox category suggestions are not supported by eBay Taxonomy, so set `EBAY_CATEGORY_ID` if you want to test listing creation in sandbox.
- Listing creation also depends on valid business policy IDs and a merchant location already existing in the connected eBay account.
