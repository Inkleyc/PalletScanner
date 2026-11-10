# PalletFlip Scope Register
Owner-approved scopes, approved 2026-11-03 by Colton, to be worked in order (001, then 002, then 003).

| ID | Working title (approved description) | State | Owner approval | Branch |
| --- | --- | --- | --- | --- |
| PF-SCOPE-001 | Safe local verification harness + CI | CLOSED | APPROVED 2026-11-03 | scope/PF-SCOPE-001-verification-harness |
| PF-SCOPE-002 | Mobile scan/photo → draft → save → next-item reliability | IN_PROGRESS | APPROVED 2026-11-03 | scope/PF-SCOPE-002-mobile-capture-reliability |
| PF-SCOPE-003 | Web Review/Inventory decisions + cross-surface sync proof | APPROVED (queued) | APPROVED 2026-11-03 | — |
| PF-SCOPE-014 | Pallets archive like items (no more hard-delete dead end) | CLOSED (VERIFIED 2026-11-09: owner removed a stuck self-test pallet on main, end-to-end) | APPROVED 2026-11-07 | scope/PF-SCOPE-014-pallet-archiving |
| PF-SCOPE-017 | Slate design port — web + mobile (experiment) | CLOSED (VERIFIED 2026-11-09: merged PR #13; owner's live pass on main; findings became PF-SCOPE-018/019) | APPROVED to build 2026-11-08; shipping approved 2026-11-08 ("Ship it — open the PR to main") | experiment/design-slate-port |
| PF-SCOPE-013 | Mobile item editor: keyboard can be dismissed and no longer traps the form | OWNER_REVIEW (merged 2026-11-09 via PR #14 as 345659bb, superseding unmergeable PR #10; owner device retest on main pending) | APPROVED 2026-11-07; merge approved 2026-11-09 ("merge it, retest on main") | scope/PF-SCOPE-013-keyboard-on-main |
| PF-SCOPE-016 | Phone test builds via TestFlight + EAS Update | IN_PROGRESS | APPROVED 2026-11-07 | — |
| PF-SCOPE-015 | Web preview hosting + Lenard-run browser passes | IN_PROGRESS | APPROVED 2026-11-07 | scope/PF-SCOPE-015-web-preview-testing |
| PF-SCOPE-019 | Mobile switches: one treatment, visible in both themes | CLOSED (VERIFIED 2026-11-09: merged PR #16; owner device check — Day switches visible, amber on, Deep unchanged) | APPROVED 2026-11-09 (owner phone-pass finding) | scope/PF-SCOPE-019-mobile-switches |
| PF-SCOPE-018 | Web live-pass fixes: Inventory cards, compact Orders toggle, Deep separation, dialog structure, Edit form facelift | IN_PROGRESS | APPROVED 2026-11-09 (owner live-pass findings; "build all 5") | scope/PF-SCOPE-018-live-pass-fixes |
| PF-SCOPE-012 | Web cloud saves translate workflow status to the database vocabulary | IN_PROGRESS | APPROVED 2026-11-07 | scope/PF-SCOPE-012-web-cloud-status-translation |
| PF-SCOPE-011 | Clients create the acquisition for each new pallet | CLOSED | APPROVED 2026-11-07 | scope/PF-SCOPE-011-acquisition-creation |
| PF-SCOPE-010 | Hosted Supabase schema alignment | CLOSED | APPROVED 2026-11-07 (Stage A; Stage B separate go-ahead) | — (dashboard-applied; record rides PF-SCOPE-011's branch) |

Scope document for PF-SCOPE-001: `project-control/PF-SCOPE-001-verification-harness.md`. Use `SCOPE_PROTOCOL.md` for the required proposal template and lifecycle. Add links to scope-specific documents and PRs as work progresses.

## Numbering note (do not remove)

The register as written before the 2026-11-03 audit used different illustrative titles for the same IDs. The audit proposed revised scopes, and the owner approved the revised descriptions above. The renumbering is recorded here so it is not a silent overwrite:

- Illustrative PF-SCOPE-001 (pre-audit): Mobile scan/photo → draft → save → next-item reliability — now the approved PF-SCOPE-002 description.
- Illustrative PF-SCOPE-002 (pre-audit): Web Review/Inventory decision and editing completion — covered by the approved PF-SCOPE-003 description.
- Illustrative PF-SCOPE-003 (pre-audit): Mobile/web sync, error recovery and regression tests — covered by the approved PF-SCOPE-003 description.
- Approved PF-SCOPE-001 (verification harness + CI) had no illustrative counterpart; it was added by the audit as the prerequisite first scope.
