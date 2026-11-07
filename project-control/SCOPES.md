# PalletFlip Scope Register
Owner-approved scopes, approved 2026-11-03 by Colton, to be worked in order (001, then 002, then 003).

| ID | Working title (approved description) | State | Owner approval | Branch |
| --- | --- | --- | --- | --- |
| PF-SCOPE-001 | Safe local verification harness + CI | CLOSED | APPROVED 2026-11-03 | scope/PF-SCOPE-001-verification-harness |
| PF-SCOPE-002 | Mobile scan/photo → draft → save → next-item reliability | VERIFIED | APPROVED 2026-11-03 | scope/PF-SCOPE-002-mobile-capture-reliability |
| PF-SCOPE-003 | Web Review/Inventory decisions + cross-surface sync proof | IN_PROGRESS | APPROVED 2026-11-03 | scope/PF-SCOPE-003-web-review-sync |
| PF-SCOPE-012 | Web cloud saves translate workflow status to the database vocabulary | VERIFIED | APPROVED 2026-11-07 | scope/PF-SCOPE-012-web-cloud-status-translation |
| PF-SCOPE-011 | Clients create the acquisition for each new pallet | CLOSED | APPROVED 2026-11-07 | scope/PF-SCOPE-011-acquisition-creation |
| PF-SCOPE-010 | Hosted Supabase schema alignment | CLOSED | APPROVED 2026-11-07 (Stage A; Stage B separate go-ahead) | — (dashboard-applied; record rides PF-SCOPE-011's branch) |

Scope document for PF-SCOPE-001: `project-control/PF-SCOPE-001-verification-harness.md`. Scope document for PF-SCOPE-003: `project-control/PF-SCOPE-003-web-review-sync.md`. Use `SCOPE_PROTOCOL.md` for the required proposal template and lifecycle. Add links to scope-specific documents and PRs as work progresses.

## Numbering note (do not remove)

The register as written before the 2026-11-03 audit used different illustrative titles for the same IDs. The audit proposed revised scopes, and the owner approved the revised descriptions above. The renumbering is recorded here so it is not a silent overwrite:

- Illustrative PF-SCOPE-001 (pre-audit): Mobile scan/photo → draft → save → next-item reliability — now the approved PF-SCOPE-002 description.
- Illustrative PF-SCOPE-002 (pre-audit): Web Review/Inventory decision and editing completion — covered by the approved PF-SCOPE-003 description.
- Illustrative PF-SCOPE-003 (pre-audit): Mobile/web sync, error recovery and regression tests — covered by the approved PF-SCOPE-003 description.
- Approved PF-SCOPE-001 (verification harness + CI) had no illustrative counterpart; it was added by the audit as the prerequisite first scope.
