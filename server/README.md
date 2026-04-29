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

You can use [server/ebay.env.example](c:/Users/colto/PalletScanner/server/ebay.env.example) as a paste-in checklist when the developer portal is available again.

## Optional environment variables

- `EBAY_ENVIRONMENT=production`
- `EBAY_SERVER_PORT=8787`
- `EBAY_MARKETPLACE_ID=EBAY_US`
- `EBAY_CURRENCY=USD`
- `EBAY_LOCALE=en-US`
- `EBAY_CATEGORY_ID=1234`
- `EBAY_SCOPE=https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account`

## Setup notes

1. In the eBay developer portal, create or edit your RuName so its accept URL points to your backend callback route.
   - Local example: `http://192.168.1.42:8787/ebay/callback`
   - Deployed example: `https://your-server.example.com/ebay/callback`
2. Put the returned `RuName` value into `EBAY_RUNAME`.
3. Set `EXPO_PUBLIC_EBAY_API_BASE_URL` in the app environment to that same backend base URL.
   - For local device testing, use your computer's LAN IP, not `localhost`.
4. Add the merchant location key and the three business policy IDs to your `.env`.
5. Start the server with `npm run ebay-server`.
6. In the app Settings tab, use the eBay connect button to authorize the seller account.

## Fastest recovery plan when eBay is accessible again

1. Fill the blank values in [server/ebay.env.example](c:/Users/colto/PalletScanner/server/ebay.env.example).
2. Copy those values into your root `.env`.
3. Start the backend with `npm run ebay-server`.
4. Open `http://YOUR-IP:8787/ebay/status` and confirm the server reports configured credentials.
5. In the app, tap `Settings -> Connect eBay Account`.
6. Test creating one listing from an inventory item.

## Important

- Sandbox category suggestions are not supported by eBay Taxonomy, so set `EBAY_CATEGORY_ID` if you want to test listing creation in sandbox.
- Listing creation also depends on valid business policy IDs and a merchant location already existing in the connected eBay account.
