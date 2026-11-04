# Development Scope and Innovation Protocol
## Scope lifecycle
`PROPOSED → APPROVED → IN_PROGRESS → VERIFIED → OWNER_REVIEW → CLOSED`. Also: `BLOCKED`, `CHANGES_REQUESTED`, `CANCELLED`. Only explicit owner approval moves a scope to APPROVED.

## Scope template
```md
# PF-SCOPE-NNN — Title
Status: PROPOSED
Owner approval: PENDING
Objective: [one clear user outcome]
Current evidence: [screens/files/tests]
Included: [workflows and screens]
Excluded: [boundaries]
Preserved UX: [what must remain recognizable]
Dependencies: [environment/integration/other scopes]
Risks and protected operations: [list]
Acceptance criteria:
- [ ] Observable user result
- [ ] Error/offline/recovery behavior
- [ ] Data/security and regression checks
Verification: [commands + mobile/browser manual steps]
Branch: scope/PF-SCOPE-NNN-short-name
Deliverables: [code/tests/screenshots/docs/report]
```

A scope should be small enough to review as one coherent workflow. Approval permits routine technical and visual refinement inside its bounds, but not changes in product intent or protected operations. Record final SHA and evidence. No scope is complete just because code compiles.

## Experimental proposals
Use `experiment/<topic>`, with an `EXPERIMENT.md` in the branch describing current behavior, exact differences, expected benefit, tradeoffs, screenshots/preview, test steps, isolated data environment, rollback and `PENDING OWNER APPROVAL`. An experiment may be built autonomously but cannot be adopted or merged to `main` without explicit owner approval.

## Suggested first scopes — not approved
1. PF-SCOPE-001: Mobile scan/photo → draft → save → next-item reliability.
2. PF-SCOPE-002: Web Review/Inventory decision and edit workflow completeness.
3. PF-SCOPE-003: Cross-surface sync/error handling and regression tests.

Muse must audit the actual code before proposing or prioritizing scopes. Do not treat examples as work authorization.

## Completion report
Status | User-visible changes | Evidence/tests | Remaining gaps/risks | Commit SHA | Owner decision required | Proposed next scope.
