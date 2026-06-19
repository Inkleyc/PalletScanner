# Production Launch Checklist

## Already Implemented

- eBay backend production guardrails.
- JWT-protected eBay backend endpoints.
- Encrypted per-user eBay token storage.
- eBay listing create/update/end flows.
- Multi-photo eBay upload.
- Runtime app bearer token support for production backend testing.
- Web export support.
- Facebook Marketplace assisted posting workflow.

## Code-Level Production Prep

1. Generate backend secrets:

   ```bash
   npm run ebay:generate-secrets
   ```

2. Put the generated values in the production host only:
   - `PALLETSCANNER_JWT_SECRET`
   - `EBAY_TOKEN_ENCRYPTION_KEY`

3. Configure production backend environment:
   - `EBAY_ENVIRONMENT=production`
   - `PALLETSCANNER_AUTH_MODE=jwt`
   - `PALLETSCANNER_ALLOWED_ORIGIN=https://YOUR_WEB_APP_HOST`
   - Production eBay credentials and policy IDs

4. Run:

   ```bash
   npm run ebay:production-check
   ```

5. For a temporary production backend smoke test before final login exists:

   ```bash
   npm run ebay:generate-test-jwt -- production-test-user 24
   ```

   Paste the token into `Settings -> eBay Integration -> Runtime App Auth`.

## External Portal Work

These cannot be completed from the repository:

- Buy or configure a persistent production backend plan.
- Attach a stable HTTPS domain.
- Create production eBay app credentials.
- Set the production eBay RuName accepted URL to:

  ```text
  https://YOUR_API_DOMAIN/ebay/callback
  ```

- Create or confirm production seller policies:
  - Payment policy
  - Return policy
  - Fulfillment policy
  - Merchant location

- Enroll in Apple Developer Program before TestFlight/App Store.
- Choose the final app login provider.

## Recommended Auth Path

Use the current runtime token field only for production smoke tests. For real
users, connect a hosted auth provider and have the app obtain a JWT at runtime.
The backend expects HS256 JWTs with:

```json
{
  "sub": "stable-user-id",
  "exp": 1790000000
}
```

Once login is connected, remove any shared preview token from production app
build environments.
