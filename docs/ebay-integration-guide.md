# eBay Integration Guide

This guide explains how eBay connects to the PalletScanner app from zero context. The short version is:

1. The app creates an inventory item and listing draft from photos or barcode scans.
2. The mobile app sends that draft to our eBay backend.
3. The backend talks to eBay because it can safely hold eBay secrets.
4. eBay checks that the connected seller account has granted permission, has a seller location, and has payment, return, and shipping policies.
5. If everything is valid, eBay turns the draft into a live listing.

If the backend is not configured, the app still helps by copying the listing text and opening the normal eBay listing page.

## The Pieces

### eBay Developer Account

This is where you create an eBay application. eBay gives that application credentials:

- `Client ID`: public application identifier.
- `Client Secret`: private password for the backend.
- `RuName`: eBay's redirect identifier for OAuth.
- Accept URL: the real URL eBay sends the seller back to after they approve access.

The `Client Secret` must never be shipped inside the Expo app. Treat it like a password.

### eBay Seller Account

This is the actual eBay account that owns the listings. It needs:

- Permission to sell.
- Business policies enabled.
- One payment policy.
- One return policy.
- One fulfillment/shipping policy.
- One inventory location.

The app credentials prove which software is asking. The seller account authorization proves which eBay account the software may post for.

### PalletScanner Mobile App

The Expo app owns the scanning, pricing, listing copy, inventory, and user workflow.

Important files:

- `lib/ebay-integration.ts`: sends listing data to the backend.
- `lib/listing-posting.ts`: decides whether to use real API posting or browser fallback.
- `app/(tabs)/settings.tsx`: opens the eBay connect URL.
- `app/(tabs)/explore.tsx`: includes the mass eBay posting flow.
- `app/capture.tsx` and `app/scan-barcode.tsx`: create the eBay-specific title and description.

The app only needs one public eBay setting:

```env
EXPO_PUBLIC_EBAY_API_BASE_URL=http://YOUR-BACKEND-HOST:8787
```

If this value is blank, the app uses browser fallback.

### PalletScanner eBay Backend

The backend is `server/ebay-server.mjs`. It is the bridge between the mobile app and eBay.

It does four jobs:

- Creates the eBay authorization URL.
- Receives the eBay OAuth callback.
- Stores the seller refresh token in `server-data/ebay-user-token.json`.
- Creates and publishes listings through eBay's Sell Inventory API.

The backend needs these environment variables:

```env
EBAY_ENVIRONMENT=sandbox
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_RUNAME=
EBAY_MERCHANT_LOCATION_KEY=
EBAY_PAYMENT_POLICY_ID=
EBAY_RETURN_POLICY_ID=
EBAY_FULFILLMENT_POLICY_ID=
EBAY_CATEGORY_ID=
EBAY_SERVER_PORT=8787
EBAY_MARKETPLACE_ID=EBAY_US
EBAY_CURRENCY=USD
EBAY_LOCALE=en-US
EXPO_PUBLIC_EBAY_API_BASE_URL=
```

Use `server/ebay.env.example` as the checklist.

## What Happens During Connection

The connection flow is called OAuth. OAuth is eBay's way of asking the seller, "Do you allow this app to create and manage inventory for you?"

1. You start the backend with `npm run ebay-server`.
2. In the app, Settings -> Connect eBay Account opens:

   ```text
   http://YOUR-BACKEND-HOST:8787/ebay/connect
   ```

3. The backend redirects the seller to eBay's permission page.
4. The seller logs into eBay and approves the requested scopes.
5. eBay redirects back to the backend callback:

   ```text
   http://YOUR-BACKEND-HOST:8787/ebay/callback
   ```

6. The backend exchanges eBay's temporary code for tokens.
7. The backend stores the refresh token locally.
8. Future listing calls use that refresh token to get short-lived access tokens.

The mobile app does not store eBay seller tokens. That is intentional.

## What Happens During Listing Creation

When an inventory item is posted to eBay, the app sends this kind of payload to the backend:

```json
{
  "title": "eBay-ready title",
  "description": "eBay-ready description",
  "price": 40,
  "floorPrice": 25,
  "condition": "Good",
  "quantity": 1,
  "photoUrl": "https://...",
  "product": {
    "name": "Item name"
  }
}
```

The backend then does the eBay work:

1. Gets a valid seller access token.
2. Picks a category.
   - If `EBAY_CATEGORY_ID` is set, it uses that.
   - In production, it can ask eBay Taxonomy for a suggested category.
   - In sandbox, set `EBAY_CATEGORY_ID` because category suggestions may not be available.
3. Creates or replaces an eBay inventory item with a generated SKU.
4. Creates an eBay offer with price, quantity, marketplace, category, location, and policies.
5. Publishes the offer.
6. Returns the eBay listing ID and URL to the app.
7. The app marks that inventory item as listed on eBay.

eBay's model is important: an inventory item is not automatically a live listing. The offer is the part that becomes live after publishing.

## Local Development Model

Local mode means you are building and testing with your own computer as the backend.

### Best For

- Early development.
- Testing sandbox listings.
- Proving the workflow before paying for hosting.
- Posting to your own eBay seller account from your own device.

### Shape

```text
Expo app on phone
  -> http://YOUR-COMPUTER-LAN-IP:8787
    -> local Node backend
      -> eBay sandbox or production APIs
```

Do not use `localhost` in the phone app. On a physical phone, `localhost` means the phone itself. Use your computer's LAN IP, such as:

```env
EXPO_PUBLIC_EBAY_API_BASE_URL=http://192.168.1.42:8787
```

### eBay Portal Setup For Local

In the eBay developer portal:

1. Create an application.
2. Choose Sandbox first.
3. Copy the sandbox `Client ID` and `Client Secret`.
4. Configure the auth accepted/redirect URL to point to your backend callback:

   ```text
   http://192.168.1.42:8787/ebay/callback
   ```

5. Copy the generated `RuName`.
6. Put those values into `.env`.
7. Create or identify a sandbox seller account.
8. Make sure that seller account has required business policies and an inventory location.
9. Start the server:

   ```bash
   npm run ebay-server
   ```

10. Check:

   ```text
   http://192.168.1.42:8787/ebay/status
   ```

11. Connect from the app Settings screen.
12. Try one listing.

### Local Limitations

- Your computer must stay awake and reachable.
- Your phone and computer usually need to be on the same network.
- Redirect URLs tied to a LAN IP can break when your IP changes.
- This is not the right model for real customers.
- It is acceptable for your own development and internal testing.

## Distribution Model

Distribution mode means other people install the app and connect their own eBay seller accounts.

### Shape

```text
Customer's installed app
  -> https://api.yourdomain.com
    -> hosted PalletScanner backend
      -> eBay production APIs
        -> customer's eBay seller account
```

The app still never talks directly to eBay with secrets. Every customer uses the same PalletScanner eBay application credentials, but each customer authorizes their own seller account.

### What Changes From Local

- The backend must be hosted publicly over HTTPS.
- The eBay Accept URL must point to the hosted callback:

  ```text
  https://api.yourdomain.com/ebay/callback
  ```

- `EXPO_PUBLIC_EBAY_API_BASE_URL` must be baked into the app build as:

  ```env
  EXPO_PUBLIC_EBAY_API_BASE_URL=https://api.yourdomain.com
  ```

- Tokens must be stored per user, not in one shared local file.
- The backend must authenticate app users before creating listings.
- The app should show connection status for the current user.
- You need production eBay keys and likely eBay application review/approval depending on the APIs and scale.

### Production Token Storage

The backend now supports per-user encrypted token files under:

```text
server-data/ebay-connections/
```

The user ID comes from the authenticated app request. In local mode, the server
can still read the legacy single-user token file for development only.

For a larger multi-user production system, the encrypted file store can later be
replaced with a database table like:

```text
users
  id
  email

ebay_connections
  user_id
  ebay_environment
  ebay_account_id
  access_token_encrypted
  refresh_token_encrypted
  expires_at
  scopes
  created_at
  updated_at

inventory_items
  user_id
  local_item_id
  ebay_sku
  ebay_offer_id
  ebay_listing_id
  ebay_listing_url
  ebay_status
```

The backend must know which app user is making the request, load that user's
eBay refresh token, then create the listing for that seller.

### Distribution Security Checklist

- Keep `EBAY_CLIENT_SECRET` only on the backend.
- Use HTTPS only.
- Require app-user authentication before `/ebay/listings`.
- Store refresh tokens encrypted.
- Add a disconnect flow that deletes the seller's token.
- Add logging around listing attempts without logging raw tokens.
- Rate limit listing creation endpoints.
- Validate title, price, quantity, and category before calling eBay.
- Store eBay listing IDs so duplicate taps do not create duplicate listings.

## The eBay Values And Where They Go

| eBay thing | What it means | Where it goes |
| --- | --- | --- |
| Client ID | Identifies your eBay app | `EBAY_CLIENT_ID` on backend |
| Client Secret | Backend password for your eBay app | `EBAY_CLIENT_SECRET` on backend |
| RuName | eBay OAuth redirect identifier | `EBAY_RUNAME` on backend |
| Accept URL | Real callback URL behind the RuName | eBay developer portal |
| Seller authorization code | Short-lived code after seller approves | Backend receives it on `/ebay/callback` |
| Refresh token | Long-lived seller permission | Backend storage only |
| Access token | Short-lived API token | Backend memory/use only |
| Merchant location key | Seller's ship-from/inventory location | `EBAY_MERCHANT_LOCATION_KEY` |
| Payment policy ID | How buyer pays | `EBAY_PAYMENT_POLICY_ID` |
| Return policy ID | Return rules | `EBAY_RETURN_POLICY_ID` |
| Fulfillment policy ID | Shipping/handling rules | `EBAY_FULFILLMENT_POLICY_ID` |
| Category ID | eBay category for the listing | `EBAY_CATEGORY_ID`, or auto-suggest in production |
| Backend base URL | Where the app sends listing requests | `EXPO_PUBLIC_EBAY_API_BASE_URL` |

## Current App Behavior

Right now, PalletScanner is already wired for a staged rollout:

- If `EXPO_PUBLIC_EBAY_API_BASE_URL` is blank:
  - eBay posting copies the listing text.
  - The app opens `https://www.ebay.com/sl/sell`.
  - The seller manually pastes and finishes the listing.

- If `EXPO_PUBLIC_EBAY_API_BASE_URL` is set:
  - eBay posting calls `POST /ebay/listings` on the backend.
  - If listing creation succeeds, the item is marked listed.
  - If listing creation fails, the app falls back to the browser helper flow.

That fallback is useful while the eBay setup is still fragile.

## Recommended Path Forward

### Phase 1: Make Local Sandbox Work

Goal: prove the full connection without risking real listings.

1. Fill `server/ebay.env.example`.
2. Copy values into `.env`.
3. Set `EBAY_ENVIRONMENT=sandbox`.
4. Set `EBAY_CATEGORY_ID` to a known sandbox-safe category.
5. Start `npm run ebay-server`.
6. Confirm `/ebay/status` says configured.
7. Connect eBay from Settings.
8. Post one simple item.

### Phase 2: Make Local Production Work For Your Own Account

Goal: create one real listing on your own seller account.

1. Switch to production eBay keys.
2. Change the eBay Accept URL to your current callback URL.
3. Set `EBAY_ENVIRONMENT=production`.
4. Confirm business policy IDs and merchant location key are from the production seller account.
5. Start with one low-risk item.
6. Verify the listing in eBay Seller Hub.

### Phase 3: Prepare Distribution

Goal: make this safe for multiple users.

1. Host the backend on a stable HTTPS domain.
2. Add app-user login.
3. Choose and connect app-user login.
4. Put the backend on persistent storage.
5. Add category/policy setup screens or a setup checklist.
6. Submit or verify any production eBay app requirements.

## Common Failure Points

### "eBay backend not configured"

The app does not have `EXPO_PUBLIC_EBAY_API_BASE_URL`.

Fix: set it to the backend base URL and restart Expo.

### "No eBay user token found"

The backend has eBay app credentials, but no seller has completed OAuth.

Fix: open Settings -> Connect eBay Account.

### "Missing required environment variable"

The backend needs a value that is blank in `.env`.

Fix: compare `.env` against `server/ebay.env.example`.

### Publish Fails After Offer Creation

eBay lets some incomplete inventory or offer calls succeed, but publishing has stricter requirements.

Fix: verify merchant location, category, payment policy, return policy, fulfillment policy, quantity, price, and condition.

### Sandbox Behaves Differently

Sandbox is useful, but it does not always support every helper endpoint exactly like production.

Fix: set `EBAY_CATEGORY_ID` manually during sandbox testing.

## Helpful eBay References

- eBay Authorization guide: https://developer.ebay.com/develop/guides-v2/authorization
- OAuth redirect/RuName guide: https://developer.ebay.com/api-docs/static/oauth-redirect-uri.html
- Authorization code token exchange: https://developer.ebay.com/api-docs/static/oauth-auth-code-grant-request.html
- Sell Inventory API overview: https://developer.ebay.com/api-docs/sell/inventory/overview.html
- From inventory item to offer: https://www.developer.ebay.com/api-docs/sell/static/inventory/inventory-item-to-offer.html
- Required fields for publishing offers: https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html
- Inventory locations: https://developer.ebay.com/api-docs/sell/static/inventory/managing-inventory-locations.html
