# Supabase Setup Guide

Supabase is PalletScanner's production login provider. It gives the app a signed
user token so the eBay backend can tell which seller is making each request.

## Create The Project

1. Go to:

   ```text
   https://supabase.com/dashboard
   ```

2. Sign in or create an account.
3. Click `New project`.
4. Pick or create an organization.
5. Use this project name:

   ```text
   PalletScanner
   ```

6. Choose a database password and save it somewhere safe.
7. Choose the closest US region available.
8. Start on the free plan while we are still validating production setup.
9. Click `Create new project`.

## Values To Collect

After the project finishes provisioning, collect these values.

### Project URL

Location:

```text
Project Settings -> API
```

Looks like:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
```

### Publishable Public Key

Location:

```text
Project Settings -> API
```

Looks like:

```env
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

This normally starts with `sb_publishable_` and is safe to ship in the app. The
existing environment variable retains its historical `ANON_KEY` name for
compatibility. Never substitute an `sb_secret_` or service-role key.

### JWT Secret

Location:

```text
Project Settings -> API -> JWT Settings
```

This is backend-only:

```env
PALLETSCANNER_JWT_SECRET=YOUR_SUPABASE_PROJECT_JWT_SECRET
```

Do not put the JWT secret in Expo, EAS public env, or the mobile/web app.

## Redirect URLs

In Supabase, go to:

```text
Authentication -> URL Configuration
```

Add these redirect URLs:

```text
palletscanner://settings
http://localhost:5173
```

After the web app has a deployed URL, also add:

```text
https://YOUR_WEB_APP_HOST/settings
```

## Where The Values Go

### Expo / EAS App Environment

Add:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Then verify locally:

```bash
npm run supabase:app-check
```

### Backend Environment

Add:

```env
PALLETSCANNER_AUTH_MODE=jwt
PALLETSCANNER_IDENTITY_PROVIDER=supabase
PALLETSCANNER_JWT_SECRET=YOUR_SUPABASE_PROJECT_JWT_SECRET
```

The backend also needs:

```env
EBAY_TOKEN_ENCRYPTION_KEY=GENERATED_BACKEND_SECRET
```

Generate that backend encryption secret with:

```bash
npm run ebay:generate-secrets
```

Use the `EBAY_TOKEN_ENCRYPTION_KEY` value from the output. For Supabase
production, do not use the generated `PALLETSCANNER_JWT_SECRET`; use the
Supabase JWT secret instead.

## Production Check

After Supabase and eBay production values are configured, run:

```bash
npm run ebay:production-check
```

It should pass only when the backend is ready for production eBay posting.

## Prepared Database Migration

The initial inventory, photo, listing, sale, activity, storage, and row-level
security schema is checked in at:

```text
supabase/migrations/202609110001_initial_inventory.sql
```

Review [backend-data-contract.md](./backend-data-contract.md) before applying it.
No migration has been run against a remote project yet.
