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

1. Create a Supabase project using
   [docs/supabase-setup-guide.md](./supabase-setup-guide.md).

2. In Supabase, collect:
   - Project URL
   - Anon public key
   - Project JWT secret

3. In Supabase Auth URL configuration, allow these redirect URLs:
   - `palletscanner://settings`
   - Your production web app Settings URL, such as
     `https://YOUR_WEB_APP_HOST/settings`
   - Your local web test URL, if needed, such as
     `http://localhost:8081/settings`

4. Add the public values to Expo/EAS app environments:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

5. Run:

   ```bash
   npm run supabase:app-check
   ```

6. Generate the backend eBay token encryption secret:

   ```bash
   npm run ebay:generate-secrets
   ```

7. Put these backend values in the production host only:
   - `PALLETSCANNER_JWT_SECRET` from the Supabase project JWT secret
   - `EBAY_TOKEN_ENCRYPTION_KEY`

8. Configure production backend environment:
   - `EBAY_ENVIRONMENT=production`
   - `PALLETSCANNER_AUTH_MODE=jwt`
   - `PALLETSCANNER_IDENTITY_PROVIDER=supabase`
   - `PALLETSCANNER_ALLOWED_ORIGIN=https://YOUR_WEB_APP_HOST`
   - Production eBay credentials and policy IDs

9. Run:

   ```bash
   npm run ebay:production-check
   ```

10. For a temporary production backend smoke test before final login exists:

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

## Recommended Auth Path

Supabase Auth is wired into the app as the recommended first production auth
provider. Add these public values to the Expo/EAS app environment:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Then set the backend JWT secret to the Supabase project JWT secret:

```env
PALLETSCANNER_AUTH_MODE=jwt
PALLETSCANNER_JWT_SECRET=YOUR_SUPABASE_PROJECT_JWT_SECRET
```

Supabase access tokens use the signed-in user's stable ID as `sub`, which lets
the eBay backend store one encrypted eBay connection per app user.

Use the manual runtime token field only for production smoke tests. For real
users, the Supabase login card in Settings obtains the JWT at runtime. The
backend expects HS256 JWTs with:

```json
{
  "sub": "stable-user-id",
  "exp": 1790000000
}
```

Remove any shared preview token from production app build environments.
