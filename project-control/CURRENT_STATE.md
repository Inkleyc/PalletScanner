# Verified Baseline, Historical Findings, and Risks
Evidence cutoff: GitHub observed 2026-11-03; `main` SHA `9594cf4492c641f338895459957dc0568390fe2a` (2026-10-23 commit). This is a **handoff orientation, not a full current-code audit**.

## Verified from repository inspection
- `main` and `inventory-hub-foundation` both pointed to `9594cf4` on 2026-11-03.
- Repository visibility was public.
- Workspaces: `apps/mobile` (Expo), `apps/web` (React/Vite), `packages/core`, `packages/api-client`; also `server`, `supabase/migrations`, `docs`.
- Root scripts include mobile lint/typecheck/sync tests, dashboard checks, server tests, schema and return-lifecycle checks.
- `docs/web-flow-audit.md` describes Overview, Review, Inventory, Pallets, Data / Analysis, Settings and their intended separation.
- `docs/mobile-working-code-reconciliation.md` preserves native scanner lifecycle and fallback-draft principles.
- `docs/return-lifecycle-validation.md` warns contract checks do not establish transactional Supabase/eBay integration readiness.
- `render.yaml` specifies commit-triggered deployment of a sandbox eBay backend; confirm actual deployment configuration before merging.

## Historical Codex audit (2026-10-23/24) — NOT newly verified
- Phase 1A dependency/security stabilization at `9594cf4`.
- Previously reported: 23 backend tests, 11 web tests, mobile typecheck, schema check and return lifecycle check passed.
- Anthropic keys revoked and retired local public env variables removed. EAS/Render remote cleanup not verified; AI deferred.
- Local emulator/web configs had referenced hosted Supabase. Two hosted projects must remain untouched; local Supabase with Docker/CLI was proposed, not confirmed installed.
- Historical inventory: 67 migrations, 35 tables, 73 functions, 53 policies. Recount.
- Prior Render health/endpoint mismatch; verify actual deployed code and URLs.
- Native camera/barcode scanner behavior still requires real-device testing.

## First risk gates
1. Audit tracked files/history for secrets; never print credential values.
2. Verify safe isolated development destinations before running apps or stateful tests.
3. Never run cloud `supabase link`, `db push`, `db reset`, or hosted migrations without explicit approval.
4. Validate authentication, RLS, business isolation, private photo storage, offline sync and marketplace idempotency.
5. Check Render auto-deploy/branch restrictions and avoid unintended deployments.
6. Compare historical docs to code; do not promote old status claims to current facts.
7. Run tests and record results; manual mobile/browser acceptance remains required.

Use labels: VERIFIED / DOCUMENTED BUT UNVERIFIED / HISTORICAL / PROPOSED / BLOCKED.
