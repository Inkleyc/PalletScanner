# PF-SCOPE-024 — Durable eBay token store (Supabase-backed, per-owner)

Status: IN_PROGRESS — build 2026-11-21 on `scope/PF-SCOPE-024-durable-token-store`; owner steps (hosted migration, Render env) and the hosted acceptance proof still pending.
Design direction: APPROVED by Colton 2026-11-12 ("Reconnect for now, finish 004, then 024"). This document is the formal scope for that approved design; it does not change the design.
Owner approval: APPROVED 2026-11-21 ("Approve PF-SCOPE-024 and build it")
Objective: The eBay seller connection survives Render redeploys and restarts — connect once, stay connected — by moving the encrypted token store from Render's ephemeral disk into the hosted Supabase database, under the owner's own row-level security.
Branch: `scope/PF-SCOPE-024-durable-token-store`

## Problem + evidence

- The eBay backend (`server/ebay-server.mjs`) stores each user's eBay OAuth tokens through `server/ebay-token-store.mjs`: one AES-256-GCM-encrypted JSON file per user (filename = sha256 of the user id) under `server-data/ebay-connections/` on the Render service's disk.
- Render's disk is ephemeral. Every redeploy — and, observed, apparent restarts/recycles — wipes the file, and the seller must reconnect eBay by hand before any listing, preview, or import work can run.
- Verified live, repeatedly: the token was wiped **three times on 2026-11-21 alone** (once by a docs-only merge's redeploy, twice more without a merge), each time forcing a reconnect mid-work. Recorded as gap item 1 in `project-control/PF-SCOPE-004-runbook.md` ("Token storage durability … → PF-SCOPE-024").
- PF-SCOPE-004 is CLOSED (2026-11-21, closeout PR #37, main `9d77b19b`) — the sequencing gate Colton set for this scope is lifted.

## Design (as approved 2026-11-12 — not reopened here)

1. **Same envelope, new home.** Persist the *same* AES-256-GCM encrypted envelope the file store already produces (`{ encrypted, iv, tag, ciphertext }`, key from `EBAY_TOKEN_ENCRYPTION_KEY`) as a `jsonb` value in a new Supabase table, one row per owner. No token-format change; the existing `encryptPayload`/`decryptPayload` code is reused, not duplicated.
2. **Owner-only RLS.** The table is keyed by `owner_id uuid references auth.users(id)`, RLS enabled, with select/insert/update/delete policies of the house form `owner_id = auth.uid()` (conventions per recent migrations, e.g. `202610100048_pricing_recommendation_dismissals.sql`). A user can only ever reach their own row.
3. **The user's own JWT does the talking.** The backend reads/writes the table through PostgREST (`${SUPABASE_URL}/rest/v1/ebay_connections`) sending `apikey: <publishable key>` and `Authorization: Bearer <the acting user's verified Supabase session JWT>` — the exact pattern `callSupabaseRpc` in `ebay-server.mjs` already uses for marketplace jobs. **No service-role key is introduced anywhere** — not in code, not in Render env.
4. **File store stays as the fallback.** When no user JWT is in play (local mode, shared-key/sandbox auth modes, or Supabase env not configured), the existing file store behaves exactly as today. Local development is untouched.
5. **Auth model unchanged.** PF-D-018 stands: route handlers keep verifying the session token via `authenticateRequest` (JWKS/ES256, HS256 legacy fallback). This scope only threads the already-present `Authorization` header from the handler into the store calls that need it.

### One design point the build must settle (named, not hidden)

Most store calls happen inside authenticated routes, where the user's JWT is on the request. **The OAuth callback is the exception:** eBay redirects the browser to `/ebay/callback`, which carries no Supabase JWT — the user is identified from the in-memory `oauthStates` record (`{ userId, expiresAt }`, 10-minute lifetime), and `exchangeAuthorizationCode` then saves the fresh token. Recommended resolution, inside this design: when the authenticated connect-start request creates the OAuth state record, also hold that request's `Authorization` header in the same in-memory record (same 10-minute lifetime, never persisted, never logged), so the callback's save can present it to PostgREST. Alternatives that keep "no service-role key" true are acceptable if they are equally small; inventing a server-side credential is not.

## Deliverables

1. **Migration** `supabase/migrations/202610110010_ebay_connections.sql`: creates `public.ebay_connections` (`owner_id uuid primary key references auth.users(id) on delete cascade`, `envelope jsonb not null`, `updated_at timestamptz not null default now()`), enables RLS, adds the four owner-only policies. Written and checked locally; **applied to the hosted project by the owner (owner step, below)**.
2. **Server store**: a Supabase-backed implementation of the existing store shape (`load` / `save` / `remove`, keyed by user id) in the token-store module, sharing the existing envelope encryption. `ebay-server.mjs` selects it per call when the request carries a verified user JWT and the Supabase env is configured; otherwise the file store answers. Error behaviour mirrors the file store's contract: a missing row returns `null` (not connected); a transport/PostgREST failure **throws** (surfaces as an error, never silently as "disconnected") — same principle as the file store's corrupted-file test.
3. **Tests**: new `node --test` cases riding the existing `server:check` harness (which already runs `ebay-token-store.test.mjs`): save→load round-trip against a stubbed `fetch` (mocked PostgREST) asserting the request carries the publishable key as `apikey` and the user JWT as `Authorization`, that the stored body is the encrypted envelope (no plaintext refresh token anywhere in it), load-miss → `null`, `remove` issues the delete, and a PostgREST error surfaces as a thrown error. Existing file-store tests keep passing unchanged.
4. **Docs**: this scope copied to `project-control/PF-SCOPE-024-durable-token-store.md` at build time; **a PF-SCOPE-024 row added to `project-control/SCOPES.md`** (the register currently has rows for 025 and 029 but none for 024 — this scope creates it) plus the scope-doc link line; runbook gap item 1 marked resolved once the acceptance proof passes.

## Owner steps (protected operations — Colton only, at build time)

1. **Approve this scope.**
2. **Apply the hosted migration**: paste the migration SQL into the Supabase dashboard SQL editor for project `okwdjtjlafziykyjgjnz` and run it (the established dashboard-SQL pattern used for all 68 hosted migrations). Hosted-database writes are a protected operation and are never done by Lenard.
3. **Set the Render env var**: on `palletscanner-ebay-api`, ensure `SUPABASE_ANON_KEY` is present with the project's **publishable key** as its value (the server reads `SUPABASE_URL` / `SUPABASE_ANON_KEY`, falling back to the `EXPO_PUBLIC_` names; `SUPABASE_URL` was added to Render 2026-11-11 — verify both by name only, never paste values through chat). Credential/env changes are a protected operation.
   - Ordering is forgiving: the code engages the database store only when the env is configured and a user JWT is present, so the migration and env var can land before or after the code merge in any order. The acceptance proof runs last, once all three are in.

## Explicitly out of scope

- No auth-model change (PF-D-018 verification, modes, and fallbacks untouched).
- No token/envelope format change; no re-encryption or key rotation.
- No Settings UI work and **no status-fetch timeout** — that is PF-SCOPE-025.
- No publish-failure persistence — that is PF-SCOPE-029.
- No mobile or web app changes; no eBay API behaviour change; no new eBay calls.
- No migration of the existing file token: the current sandbox connection does **not** transfer. The first connect after cutover writes the database row (one final reconnect — the last one this problem should ever cause).
- No fix for concurrent-refresh races (today's file-store behaviour is unchanged in that respect).

## Risks and mitigations

- **RLS misconfiguration exposes tokens.** Mitigations stack: (a) the stored value is AES-256-GCM ciphertext — a leaked row alone yields no usable token without `EBAY_TOKEN_ENCRYPTION_KEY`, which stays only in Render env; (b) owner-only policies on all four verbs, `with check` on insert/update; (c) the backend holds no service-role key, so there is no key in the deployment that can bypass RLS; (d) the negative test in Verification must pass before the acceptance proof counts.
- **Holding a JWT in the in-memory OAuth state record** (design point above): in-memory only, 10-minute lifetime identical to the existing state record, never written to disk, logs, or the database.
- **PostgREST/Supabase outage** would block token loads. Behaviour on failure is a thrown, visible error (not a false "disconnected"), and the file store remains in the codebase as the local fallback — but there is no automatic failover for hosted requests in this scope; noted as an accepted residual, revisit only if it bites.
- **Merge = redeploy**: merging this scope's PR redeploys the Render backend (as every merge does). With the env-gated selection above, a merge that lands before the owner steps degrades to today's file-store behaviour rather than an outage.

## Verification

- Root `npm run check` green (includes `server:check` — `node --check` + `node --test` over the server suite — and `schema:check`).
- CI green on the scope PR (the full `check.yml`, including the local Supabase stack run).
- **RLS negative test** (recorded in the completion report): against the local Supabase stack (`supabase start`, as CI runs it) — or, if the SQL harness can't express it, manually against the hosted project after the owner applies the migration: authenticate as user A, write a connection row; authenticate as user B and attempt to select/update/delete A's row via PostgREST → expect zero rows visible and writes rejected; B reads only B's row. Two test users, no real customer data.
- Local-dev regression: server started with no Supabase env → file store answers, local mode works exactly as today.

## Acceptance criteria

- [ ] **Headline proof:** in the app, Connect eBay → Settings reads "Ready to list" → merge any commit to `main` (Render redeploys) → after the deploy and cold start, Check status still reads "Ready to list" with **no reconnect**. 
- [ ] Restart case: a further Render restart or second redeploy → still connected, no reconnect.
- [ ] Disconnect still works: Disconnect in the app removes the database row and status returns to not-connected; reconnecting re-creates it.
- [ ] RLS negative test passed and recorded (Verification, above).
- [ ] No service-role key exists in the backend code or the Render env (verified by env-name listing).
- [ ] Root check + CI green; register and runbook updated; completion report records the final SHA and the proof evidence (timestamps and status readouts only — never token contents).

## Sequencing

PF-SCOPE-004 closed 2026-11-21, which was this scope's only gate. After 024: **PF-SCOPE-025** (Settings status-fetch timeout, APPROVED 2026-11-19 — can ride with or right after 024), then **PF-SCOPE-029** (publish-failure persistence, APPROVED 2026-11-21). PF-SCOPE-005 (AI) remains separately gated and is not part of this sequence.
