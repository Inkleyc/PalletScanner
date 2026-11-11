# PF-SCOPE-007 — Config hygiene: settle the audit-flagged defaults
Status: CLOSED (VERIFIED 2026-11-10 — integrated onto current main; Render dashboard read recorded below; root check + CI green)
Owner approval: APPROVED 2026-11-04 (all four scopes 004–007 approved by Colton; sequence 007 first)
Objective: Resolve the two configuration conflicts the 2026-11-03 audit flagged, plus the related environment default, and document the resulting defaults — so the sandbox proof (PF-SCOPE-004) and any later production work run against settled, fail-safe configuration instead of contradictory defaults.

Current evidence:
- Conflict 1 — AI key required while AI is deferred. `server/production-check.mjs` listed `ANTHROPIC_API_KEY` among required production values, so the production readiness check failed without an AI key — while the charter and PF-D-011 say AI reactivation is deferred unless specifically scoped/approved, and the handoff "do not re-enable AI" control is in force. The same script correctly forbids a client-visible AI key. No AI-enabled flag existed in code; AI availability at runtime is key-presence only (`server/ai-service.mjs` returns 503 without a key).
- Conflict 2 — CORS default `*` vs production guard. `server/ebay-server.mjs` defaulted `PALLETSCANNER_ALLOWED_ORIGIN` to `"*"`, while the server's own production validation throws if the origin is `*` in production mode, and `production-check.mjs` rejects `*` too. The `*` default was only ever safe outside production, but nothing in the default said so.
- Related default — environment defaults to production. `server/ebay-server.mjs` defaulted `EBAY_ENVIRONMENT` to `"production"` when unset, while `render.yaml` sets `sandbox` and `server/ebay.env.example` sets `sandbox`. An unset variable silently meant production — the riskiest direction for a default.
- `render.yaml` (read in the repo): one service, `palletscanner-ebay-api`, Docker, free plan, `autoDeployTrigger: commit`, `EBAY_ENVIRONMENT=sandbox` set explicitly, secrets via `sync: false`/`generateValue`. Remote Render state VERIFIED read-only 2026-11-10 (Lenard, Render dashboard): service `palletscanner-ebay-api` (srv-d8n2b2jtqb8s73cmlsb0) — Docker web service (Dockerfile path ./Dockerfile.ebay), Free plan, Oregon (US West), source Inkleyc/PalletScanner branch `main`, Auto-Deploy "On Commit". Environment (16 variables): `EBAY_ENVIRONMENT=sandbox` confirmed; `PALLETSCANNER_ALLOWED_ORIGIN` is NOT set (consistent with the 2026-11-10 functional probes, which returned `Access-Control-Allow-Origin: *`). Live service matches `render.yaml` on every checked point; no changes were made.

Included:
- Owner-approved resolutions, implemented and documented, for: (a) `production-check` requires an AI key only when AI is explicitly enabled via the named flag `PALLETSCANNER_AI_ENABLED=true`; with the flag unset/false the key is not required and AI stays deferred. (b) The CORS default per environment: an explicit origin is required in production (enforced at server startup); `*` is permitted only for sandbox/local runs and is documented as such. (c) The `EBAY_ENVIRONMENT` default: fail closed — the variable must be set explicitly to `sandbox` or `production`; an unset value makes the server refuse to start with a clear message. Production is only ever reached by explicit setting.
- Documentation of the resulting defaults in `server/ebay.env.example`, `server/ebay.production.env.example`, and `server/README.md`, plus code comments at each default, so the next agent does not re-derive them.
- Read-only verification of the Render deployment configuration as far as the repo allows (see evidence above). No deployment, env-var, or service changes; no deploys triggered.
- Regression checks: `npm run check` plus new `node:test` coverage for the production-check outcomes and the server startup defaults.

Excluded:
- AI reactivation of any kind (no key required, no provider enabled, no change to `server/ai-service.mjs` runtime behaviour). No behaviour change beyond the documented defaults. No migration edits, no RLS/auth changes, no eBay calls, no credentials, no deployments, no Render config edits, no mobile/web app code changes.

Preserved UX:
- No user-visible change. Server behaviour changes only in the documented default/guard cases (e.g. a previously silently-production run now fails loudly with a clear message; a production readiness check without AI enabled no longer fails on the missing AI key).

Dependencies:
- None on PR #4/#5 for implementation (server config only; disjoint from mobile/web scope files). Recommended before PF-SCOPE-004 implementation, since the sandbox proof relies on the settled `EBAY_ENVIRONMENT` default. No credentials. No Colton input beyond the scope approval already given.

Risks and protected operations:
- Changing a default can change what runs in an environment nobody inspected: mitigated by the read-only Render check (repo side) and by making the new defaults fail loudly (explicit error) rather than silently picking a different environment. The deployed sandbox service sets `EBAY_ENVIRONMENT=sandbox` explicitly in `render.yaml`, so the new explicit-required default cannot flip it to production; `Dockerfile.ebay` sets no `EBAY_ENVIRONMENT`, so a non-Render Docker run without the variable now fails loudly instead of silently running production — intended and documented.
- Render dashboard state is UNVERIFIED in this session; if the live service differs from `render.yaml`, that is a finding to record, with no change made. No protected operations are expected in this scope.

Acceptance criteria:
- [x] The three defaults are implemented and documented; the two audit-flagged conflicts no longer exist in code or docs.
- [x] Production-check outcomes are recorded for representative env combinations, including a loud failure (not silent production) when the environment is unset at server startup. — Covered by the new `server/production-check.test.mjs` and `server/ebay-server-defaults.test.mjs`, green in the root check on the integrated tree (2026-11-10).
- [x] Render's deployment configuration is recorded (service, branch behaviour, env) — repo side from `render.yaml`, remote side verified read-only in the dashboard 2026-11-10 (see Current evidence); the two agree.
- [x] `npm run check` exits 0 (integrated tree, 2026-11-10); no behaviour change beyond the documented defaults; no secrets in the diff.

Verification:
- Commands: `npm run check`; new `server/production-check.test.mjs` (production-check outcomes across env combinations) and `server/ebay-server-defaults.test.mjs` (server startup defaults: unset environment refuses to start, sandbox starts, production without required config fails loudly).
- Manual: none required beyond reading the Render dashboard state (read-only, parent) and confirming the documented defaults.
- Branch: scope/PF-SCOPE-007-config-hygiene
- Deliverables: config/default changes + docs, Render verification notes, completion report with final SHA and CI evidence.

Completion report: COMPLETE 2026-11-10. Implemented on scope/PF-SCOPE-007-config-hygiene (PR #6, CI green on the original head 09e44950). Before merge, the branch was integrated onto current main (d0fce07): the only conflict was `project-control/SCOPES.md` (the register had moved on; main's version kept, and the register gained this scope's row — it had only ever existed on this branch). All server changes merged cleanly. Root `npm run check` on the integrated tree: exit 0. Render dashboard read recorded above (2026-11-10, read-only, no changes). The integrated tree was pushed to the same branch so PR #6 itself carries the merge. VERIFIED and CLOSED on merge.
