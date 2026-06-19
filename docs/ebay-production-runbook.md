# eBay Production Runbook

## What Is Ready

- Dynamic eBay categories from Taxonomy.
- Category-valid conditions and required item specifics.
- Multi-photo upload through eBay Media API.
- Listing ID, URL, SKU, offer ID, category, status, and errors stored per item.
- Direct View on eBay actions.
- Existing offers are updated instead of duplicated.
- Mark Sold and Remove withdraw active eBay offers before changing local data.
- Encrypted per-user token files.
- JWT-protected listing, status, connect URL, and disconnect endpoints.
- Per-user listing rate limits.
- Configurable CORS.
- Docker deployment with a persistent token volume.

## External Decisions Still Required

1. Choose a stable HTTPS host and domain, such as `api.example.com`.
2. Choose the app-user identity provider that issues HS256 JWTs with a stable `sub`.
3. Create production eBay application credentials.
4. Configure production seller policies and inventory locations.
5. Rotate the sandbox client secret that was shared during development.
6. Use a backend plan with persistent storage before live listings.
7. Enroll in the Apple Developer Program before TestFlight or App Store iOS builds.

## Sandbox Exit Gate

Do not switch the deployed backend to `EBAY_ENVIRONMENT=production` until all of
these are true:

- The backend is on a stable HTTPS domain that will not change after OAuth setup.
- `PALLETSCANNER_AUTH_MODE=jwt` is enabled.
- The app has real user login and sends a per-user `Authorization: Bearer` token.
- `EBAY_TOKEN_ENCRYPTION_KEY` and `PALLETSCANNER_JWT_SECRET` are strong generated
  secrets stored only in the host.
- The server has persistent storage for `server-data/ebay-connections`.
- Production eBay client ID, client secret, and RuName are installed.
- Production payment, return, fulfillment, merchant location, and optional
  category values are from the production seller account.
- The sandbox eBay secret that was shared during development has been rotated.

The free Render sandbox service is good for proving the flow. It is not suitable
for production eBay because it can sleep, restart, and lose OAuth token files.

Run the local readiness check before changing hosted production settings:

```bash
npm run ebay:production-check
```

The check validates the production eBay environment, JWT mode, non-sandbox keys,
specific CORS origin, and required backend secrets. It cannot verify external
eBay account review or Apple Developer enrollment; those still need to be
confirmed in their portals.

## Deploy

### Render

The root `render.yaml` provisions a free sandbox Docker web service with
generated backend encryption/authentication secrets. It is intended for
development and external testing before live eBay credentials are enabled.
The free sandbox service uses a shared access key so anonymous internet
traffic cannot operate the connected sandbox account. Put the same generated
value in Render as `PALLETSCANNER_API_KEY` and in the Expo preview environment
as `EXPO_PUBLIC_PALLETSCANNER_AUTH_TOKEN`. This is development-only; production
must use per-user JWT authentication.

Free Render services can sleep and use an ephemeral filesystem. The encrypted
eBay authorization token can disappear after a restart or redeploy, requiring
the sandbox seller account to be connected again. Do not use this setup for
live listings.

In Render:

1. Create a new Blueprint from the `Inkleyc/PalletScanner` repository.
2. Enter the sandbox eBay values marked `sync: false`.
3. Apply the Blueprint and wait for `/health` to become healthy.
4. Use the assigned `https://palletscanner-ebay-api.onrender.com` URL, or the
   exact Render URL shown in the dashboard, for the eBay callback and EAS app
   environment.

When real testers need reliable access, change `plan` to `starter`, add a
persistent disk mounted at `/app/server-data`, and switch
`EBAY_ENVIRONMENT` to `production` only after entering production eBay
credentials and policies.

### Self-hosted Docker

1. Copy `server/ebay.production.env.example` to
   `server/ebay.production.env`.
2. Generate strong secrets:

   ```bash
   npm run ebay:generate-secrets
   ```

3. Put different generated values in:
   - `PALLETSCANNER_JWT_SECRET`
   - `EBAY_TOKEN_ENCRYPTION_KEY`
4. Fill the production eBay credentials, policies, and location.
5. Start locally:

   ```bash
   docker compose -f docker-compose.ebay.yml up --build
   ```

6. On a public Linux host, point the domain's DNS `A`/`AAAA` record at the
   host, set `EBAY_DOMAIN=api.example.com`, and start the automatic HTTPS
   stack:

   ```bash
   docker compose -f docker-compose.ebay.https.yml up -d --build
   ```

7. Deploy the same container to a host with:
   - HTTPS termination.
   - A persistent volume mounted at `/app/server-data`.
   - Health checks against `/health`.
   - Environment variables stored as host secrets.

## eBay Portal Cutover

Set the production RuName accepted URL to:

```text
https://api.example.com/ebay/callback
```

Set the app build environment to:

```env
EXPO_PUBLIC_EBAY_API_BASE_URL=https://api.example.com
```

The app must obtain a signed user JWT after login and send it as:

```text
Authorization: Bearer USER_JWT
```

The JWT must use HS256, include a stable `sub`, and optionally include `exp`.
Supabase Auth is the app's first supported login path. Put these values in the
Expo/EAS app environment:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Set `PALLETSCANNER_JWT_SECRET` on the backend to the Supabase project JWT
secret so the backend can verify those access tokens.

Until the final identity provider is connected, you can smoke-test production JWT
mode with a short-lived token:

```bash
npm run ebay:generate-test-jwt -- production-test-user 24
```

Paste that token into `Settings -> eBay Integration -> Runtime App Auth`. This is
for production backend testing only. A released app should get the JWT from real
login at runtime.

## Credential Rotation

Before any production release:

1. Generate a new sandbox client secret in the eBay developer portal.
2. Replace `EBAY_CLIENT_SECRET` locally.
3. Reconnect the sandbox seller and run one listing test.
4. Never reuse the sandbox secret for production.
5. Create a separate production keyset.
6. Store secrets only in the backend hosting provider.
7. Confirm `.env`, `server-data`, and production env files are ignored by Git.
8. Rotate `PALLETSCANNER_JWT_SECRET` and
   `EBAY_TOKEN_ENCRYPTION_KEY` through a controlled migration if compromised.

## Production Verification

1. `GET /health` returns `{"ok":true}`.
2. Unauthenticated `GET /ebay/status` returns `401`.
3. Authenticated `GET /ebay/connect-url` returns an eBay authorization URL.
4. OAuth callback stores an encrypted token under `server-data/ebay-connections`.
5. A listing with multiple photos publishes successfully.
6. Reposting the same item preserves its offer and listing IDs.
7. Mark Sold withdraws the offer before recording the sale locally.
8. Removing an item withdraws the offer before deleting local inventory.
9. The inventory item shows View on eBay.
10. `POST /ebay/disconnect` removes that user's authorization.
11. Another user cannot see or use the first user's eBay connection.

## Mobile Builds

The repository includes development, preview, and production profiles in
`eas.json`. Before the first cloud build:

1. Sign in with `npx eas-cli login`.
2. Link the project with `npx eas-cli init`.
3. Create `EXPO_PUBLIC_EBAY_API_BASE_URL` in the EAS `preview` and
   `production` environments.
4. Add the app's runtime authentication configuration to those environments.
5. Run `npx eas-cli build --profile preview --platform all`.
6. After preview validation, run
   `npx eas-cli build --profile production --platform ios`.
7. Submit the iOS production build to TestFlight with
   `npx eas-cli submit --platform ios --latest`.

## Web Preview

The browser app is built from the same Expo project. It uses IndexedDB for
inventory/settings persistence, browser modals for app alerts, and the same
Render eBay backend as the mobile preview.

To publish a preview web deployment:

```powershell
npx eas-cli env:pull preview --path .env.preview
# Load the EXPO_PUBLIC_* values from .env.preview for this shell.
npm run web:export
npm run web:deploy
Remove-Item .env.preview
```

`npm run web:deploy` uploads the exported `dist` folder to EAS Hosting. That is
an external publication step, so do it only when the current build is ready to
share.
