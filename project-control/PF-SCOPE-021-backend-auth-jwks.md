# PF-SCOPE-021 — Backend auth verifies Supabase session tokens (JWKS)

Status: CLOSED (VERIFIED 2026-11-11 — owner live pass: after SUPABASE_URL was added to Render, Check status on the live site returned the full readiness readout: eBay app credentials, merchant location, payment/return/fulfillment policies all green, only "Seller account authorization" outstanding; the eBay card is now sending the session token and the server is verifying it against the project JWKS. See Verification.)
Owner approval: 2026-11-11 ("Approve PF-SCOPE-021 and build it"). The owner
rejected a shared-key workaround the same evening and directed that the
proper fix land as its own scope first (PF-D-018). PF-SCOPE-004 is paused
until this scope's live pass succeeds.

## Problem (verified live during the PF-SCOPE-004 run, 2026-11-11)

1. The deployed backend (Render, `palletscanner-ebay-api`) runs
   `PALLETSCANNER_AUTH_MODE=jwt`, but `PALLETSCANNER_JWT_SECRET` is not set
   on the service (owner dashboard read: names only, plus the mode value).
2. The Supabase project signs session tokens **ES256** — its JWKS endpoint
   publishes an EC P-256 key — while `server/auth.mjs` verified **HS256
   only**. Even with the legacy secret set, a real session token fails the
   alg check.
3. Net effect: the backend could authenticate nobody — no token → 401
   "Authentication required."; a session token → 500 (missing secret).
   No authenticated backend route had ever been exercised live, so the gap
   was invisible until 004 reached Check status.
4. Client half: the web Settings eBay card sent only the manual
   sessionStorage token and never the Supabase session (the quantity-jobs
   executor already used the session correctly), and it seeded its backend
   URL from the localStorage preference only, ignoring the build-time
   `VITE_AI_API_BASE_URL` resolution the publishing paths use — the
   "Enter the eBay backend URL first" dead-end on a configured deployment.

## Changes

- `server/auth.mjs`: jwt mode now dispatches on the token's alg. **ES256**
  tokens verify against the Supabase project's JWKS
  (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`), cached by key id with a
  refresh when an unknown key id appears (signing-key rotation); a cached
  key still verifies through a transient JWKS outage, and with no cached
  key verification fails closed. **HS256** keeps verifying against
  `PALLETSCANNER_JWT_SECRET` as a legacy fallback; claim checks (`sub`,
  `exp`) are shared. `authenticateRequest` is now async; `local` and
  `shared-key` modes are unchanged.
- `server/ebay-server.mjs`: all `authenticateRequest` /
  `authenticateAiRequest` call sites await the (now async) authenticator.
- `server/production-check.mjs`: `PALLETSCANNER_JWT_SECRET` is no longer
  unconditionally required; instead the check fails when jwt mode has **no**
  verification path (no `SUPABASE_URL` for the JWKS and no legacy secret),
  so tonight's silent trap fails loudly.
- `apps/web/src/App.jsx` (`EbaySettings`): requests attach the signed-in
  Supabase session token when no manual token is saved (manual token still
  wins as an override); the card's backend URL seeds from the shared
  resolution in `web-services.js` (new `configuredBackendBaseUrl` export —
  build-time value, then preference, never the page origin), so a
  configured deployment no longer dead-ends.
- Docs: `server/ebay.production.env.example` and `server/README.md` now
  describe the JWKS path and mark the JWT secret legacy-optional.

## Verification

- Unit: `server/auth.test.mjs` gains an ES256 suite served by a local JWKS
  (valid token accepted; wrong key, expired, and not-yet-published rotated
  key rejected; the rotated key verifies once published, with a refetch).
  Existing HS256/local tests converted to the async API, unchanged in
  substance. `server/production-check.test.mjs` covers the new gate both
  ways. Root `npm run check` green on the branch (2026-11-11).
- Local live-JWKS boot test (2026-11-11): the server booted in jwt mode
  against the real project JWKS — no token → 401 "Authentication
  required."; a forged ES256 token with an unknown key id → 401 "Invalid
  authentication token." (previously: a 500 on the missing secret).
- **Live pass (owner, pending):** after merge + Render auto-redeploy —
  signed in on palletflip.pages.dev → Settings → eBay card → **Check
  status** returns a real status readout (no URL prompt, no 401). That
  pass closes this scope and resumes PF-SCOPE-004 at Connect eBay.

## Out of scope

- eBay token-store durability on Render's ephemeral disk (PF-SCOPE-004
  gap list).
- Removing the manual-token field (kept for local/shared-key development).
- Mobile eBay backend calls (the server half benefits any client that
  presents a session token; a mobile live check rides PF-SCOPE-004).
