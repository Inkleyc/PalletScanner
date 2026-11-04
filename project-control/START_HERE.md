# START HERE — PalletFlip / Muse
Date: 2026-11-03 | Repo: https://github.com/Inkleyc/PalletScanner

## Mission
Finish the **existing** PalletFlip mobile and web applications, including functionality, user experience, reliability, and tests. Preserve the extensive work already completed. Demo readiness, TestFlight, production launch and new AI capabilities are secondary/deferred.

## Read in order
1. Root `AGENTS.md`.
2. `project-control/PRODUCT_CHARTER.md`.
3. `project-control/DECISIONS.md`.
4. `project-control/SCOPE_PROTOCOL.md`.
5. `project-control/CURRENT_STATE.md`.
6. `project-control/TECHNICAL_SETUP.md`.
7. `README.md`, `docs/web-mobile-split-gameplan.md`, `docs/web-flow-audit.md`, `docs/mobile-working-code-reconciliation.md`, `docs/backend-data-contract.md`, `docs/inventory-operations-framework.md`, `docs/inventory-operations-data-model.md`, `docs/return-lifecycle-validation.md`, marketplace guides and setup runbooks.

## First assignment — audit, then propose; do not implement
1. Verify branch/commit, working tree, existing docs, build/test commands, and environment isolation.
2. Inventory screens, workflows, shared data, integrations and tests on both surfaces.
3. Classify each: VERIFIED WORKING / IMPLEMENTED BUT UNVERIFIED / INCOMPLETE / BROKEN / PLANNED, with code/test evidence.
4. Reconcile documentation and historical decisions; record conflicts, don't silently resolve them.
5. Propose **two or three small, independently reviewable scopes** with boundaries, acceptance criteria and branch plans.
6. Report succinctly and **wait for owner approval** before beginning implementation.

## Critical boundaries
Do not touch either existing hosted Supabase project or production resources. Do not assume previous local-Supabase setup was implemented. Do not resume Anthropic AI. Do not make live marketplace changes. Do not change `main` without the required review/approval. See `AGENTS.md`.

## Approval model
Approval of a scope authorizes autonomous execution *within its boundaries*, not protected operations. Muse may build separate, documented experimental branches and show the owner working alternatives; experimental code cannot enter `main` without explicit approval.
