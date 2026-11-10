# PF-SCOPE-015 — Web preview hosting + Lenard-run browser passes
Status: IN_PROGRESS
Owner approval: APPROVED 2026-11-07 (owner chose the bundle: preview hosting + Lenard-run testing; recorded as PF-D-015)
Decision authority: PF-D-015 (preview deploys and Lenard-run passes inside approved-scope autonomy); PF-D-008 unchanged (merges, hosted-database writes, and any public launch stay owner-gated).

## Problem

The web app exists only as a dev server on the owner's machines. Lenard cannot open it (no access to the owner's computers), so every web browser pass waits on the owner at a keyboard, and passes have already been lost mid-run to tooling limits on the owner's machine (PF-SCOPE-003 pass, 2026-11-07). PR #5's remaining checks and PR #7's pass are blocked on exactly this.

## Decision summary (PF-D-015)

Per-branch preview hosting for the web app; Lenard runs browser passes against the preview URL in cloud mode and records evidence in the scope docs. Owner keeps merges and hosted-database writes.

## Included

- **Host: Cloudflare Pages** (free tier; per-branch/PR preview URLs; near-zero switch cost to Netlify if the owner prefers). Git integration on the repo, configured by the owner once (account + repo authorization):
  - Build: project root `apps/web`, framework Vite, build command `npm run build`, output `dist`.
  - Build environment: `VITE_SUPABASE_URL` (hosted project URL), `VITE_SUPABASE_PUBLISHABLE_KEY` (client-safe by design — it ships in the bundle), `VITE_AI_API_BASE_URL=https://palletscanner-ebay-api.onrender.com` (the app's backend base resolution already supports this variable; dev keeps using the Vite proxy).
  - Production branch `main` also deploys a preview of main; branch previews for `scope/**`.
- **Repo-side:** `apps/web/.env.example` documenting the build-time variables (placeholders only); this scope doc + PF-D-015 + register rows. No app code changes are needed: no client-side URL routing (tab state), so no SPA fallback config; the backend base is env-driven.
- **Backend CORS check (owner, one-time):** the Render backend pins a single origin when `PALLETSCANNER_ALLOWED_ORIGIN` is set; per-branch preview origins vary, so for the preview phase it must be unset/`*` on Render (the sensitive backend calls require a Supabase bearer token; the backend is sandbox-only). Pinning a production origin returns with the launch decision.
- **Lenard's cloud session:** one OTP sign-in in Lenard's browser (code supplied by the owner at that moment through the secure prompt); the session persists in the browser profile. No credentials in chat or code.
- **Test-data hygiene (Lenard):** records created during passes are named as test data and archived after the pass (the archive model, PF-D-014, makes this clean).

## Explicitly excluded

- No custom domain, no public launch, no change to the Render backend's deployment.
- No AI enablement (PF-SCOPE-005 gates that; the AI pass step stays skipped until then).
- Mobile deployment is PF-SCOPE-016.

## Acceptance checks

- [ ] A `scope/**` branch preview URL loads the web app in Lenard's browser, signed in, showing "Cloud data / Cloud inventory".
- [ ] Lenard completes a real browser pass against a preview URL (first use: PF-SCOPE-003 checks 6–7, whose staging still needs its own hosted-write go-ahead) and records the evidence in that scope's doc.
- [ ] CI green on this branch (docs + env example only).

## Completion record

(Pending — filled in at verification.)
