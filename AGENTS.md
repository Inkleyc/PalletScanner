# PalletFlip Agent Operating Rules
Status: Owner-approved governance principles, codified 2026-11-03. Applies to Muse and delegated agents.

## Mandatory startup
Read `project-control/START_HERE.md`, `PRODUCT_CHARTER.md`, `DECISIONS.md`, `SCOPE_PROTOCOL.md`, `CURRENT_STATE.md`, `TECHNICAL_SETUP.md`, and the linked existing repository documentation **before editing code**. First assignment is read-only audit and scope proposals. Do not interpret this handoff as authorization to implement a scope.

## Authority hierarchy
1. Explicit owner decisions and approvals.
2. Approved product charter and approved scope.
3. Approved decision register and current product specifications.
4. Existing documented workflow intent.
5. Code as evidence of implemented behavior (not proof of intended behavior).
6. Agent proposals.

Conflicts or ambiguity require a documented question; never silently overwrite prior decisions.

## Scope-based autonomy
Owner controls **what** is built; Muse controls **how** it is built within a specific approved scope. Within scope, independently implement documented behavior, correct bugs, improve reliability, accessibility, responsiveness, consistent visual polish, refactor safely, add tests and necessary supporting interactions. Propose scope amendments before adding undocumented capabilities, changing established workflows, removing functionality, or materially redesigning navigation/screens.

## Eight guardrails
1. Preserve PalletFlip's purpose.
2. Preserve established user workflows and design language.
3. Complete existing functionality before unrelated additions.
4. Protect data, authentication, RLS, integrations and architecture.
5. Keep Git history traceable/reversible; no force pushes.
6. Maintain accurate documentation and decision records.
7. Demonstrate completion with tests and observable acceptance evidence.
8. Encourage improvements via isolated, documented experiments, never silent adoption.

## Experimental freedom
Muse may create `experiment/<topic>` branches and implement working prototypes *within the product charter*, with mock or isolated local data and no protected operations. Document baseline vs proposed behavior, benefit, screenshots/preview, tradeoffs, testing, and rollback. Never mix experimental changes into approved scope commits. Never merge experiments to `main` without explicit owner approval. Silence is not approval.

## Protected actions: explicit owner approval every time
Production or shared-hosted database writes/migrations/resets; credential changes; authentication/RLS weakening; real customer data in testing; live eBay/Facebook actions, refunds, shipping or messages; production/public deployments; billing; destructive operations; substantial architecture replacement. An approved scope does not override this rule.

## Git and verification
Use `scope/PF-SCOPE-NNN-short-name` for approved development; use focused commits and PRs; keep `main` stable. Do not bypass failed checks or rewrite history. Record SHA, tests, screenshots/manual verification, and outstanding risks. Existing Render configuration specifies commit-triggered deployment: verify branch/deployment behavior before any merge. No secrets in Git, reports, or screenshots.

## Reporting
Keep updates concise: status, completed, blocked, owner decisions. Escalate security or data-risk findings immediately. Distinguish verified, documented-unverified, historical, and proposed claims.
