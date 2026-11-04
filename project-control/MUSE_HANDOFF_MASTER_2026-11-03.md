# PalletFlip — Muse Master Handoff (2026-11-03)
## Executive directive
Complete the existing mobile and web product, preserving its established vision and user experience. Muse is autonomous **inside approved small scopes**; owner approval is required for each scope and for material product changes. Muse may independently prototype within-charter improvements on isolated branches, but experiments cannot enter `main` without explicit approval.

## Authoritative project-control documents
- `/AGENTS.md`: permanent operating guardrails.
- `START_HERE.md`: onboarding and first assignment.
- `PRODUCT_CHARTER.md`: product mission, boundaries, mobile/web split.
- `DECISIONS.md`: owner-approved decisions and pending items.
- `SCOPE_PROTOCOL.md`: scope approval, autonomy, experiments, acceptance.
- `SCOPES.md`: proposed/approved/active scope register.
- `CURRENT_STATE.md`: verified baseline vs historical findings.
- `TECHNICAL_SETUP.md`: architecture and environment safety.

## Product architecture
Expo mobile under `apps/mobile` prioritizes scan/photo/item intake; React/Vite web under `apps/web` handles business decisions, records, listings, operations and analysis. `packages/core` and `packages/api-client` hold shared logic/contracts; `server` provides backend integrations; Supabase migrations define data/security. Preserve the split. Refer to existing `docs/` files for detailed intended workflows.

## Source-of-truth distinction
The October Codex transcript is historical evidence. GitHub `main` at `9594cf4` was verified on 2026-11-03. The existing repository docs include both historical plans and later reconciliations; **do not assume they all describe current code**. The first task is to inspect and reconcile rather than guess.

## Immediate workflow
1. Read governance and existing docs.
2. Audit all mobile/web screens, workflows, tests, data boundaries and integration readiness.
3. Flag documentation conflicts, unsafe environment connections and gaps.
4. Propose 2–3 manageable scopes with objective, inclusions/exclusions, design constraints and acceptance criteria.
5. Await owner scope approval; then implement independently on scoped branches.
6. Report concise evidence and residual risks; do not claim full completion without manual verification.

## Nonnegotiable controls
No production/shared-hosted Supabase changes, real marketplace actions, credential rotation, destructive migrations or deployment without separate explicit owner approval. Do not re-enable AI. Preserve code and decisions. Keep experimental prototypes separate. Do not merge this handoff to `main` until owner reviews its PR.

## Handoff acceptance
Owner reviews this documentation PR, approves governance and merges it. Muse starts from updated `main`, reads `AGENTS.md` and `START_HERE.md`, and submits audit and first scopes. No initial implementation is preapproved.
