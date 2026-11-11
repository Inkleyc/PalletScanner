# PalletFlip Scope Register
Owner-approved scopes, approved 2026-11-03 by Colton, to be worked in order (001, then 002, then 003).

| ID | Working title (approved description) | State | Owner approval | Branch |
| --- | --- | --- | --- | --- |
| PF-SCOPE-001 | Safe local verification harness + CI | CLOSED | APPROVED 2026-11-03 | scope/PF-SCOPE-001-verification-harness |
| PF-SCOPE-002 | Mobile scan/photo → draft → save → next-item reliability | CLOSED (VERIFIED 2026-11-07: device pass 9/9; PR #4 merged; closed 2026-11-10 on the PF-SCOPE-003 successor merge, which carries its record) | APPROVED 2026-11-03 | scope/PF-SCOPE-002-mobile-capture-reliability |
| PF-SCOPE-003 | Web Review/Inventory decisions + cross-surface sync proof | CLOSED (VERIFIED 2026-11-10: full 7-check pass — owner cloud run + local-mode pass + hosted-DB proof; PR #5 superseded by this successor after conflicts with main) | APPROVED 2026-11-03 | scope/PF-SCOPE-003-integration |
| PF-SCOPE-004 | End-to-end eBay sandbox proof | IN_PROGRESS (prep 2026-11-11: token-store encryption verified, Render config verified 2026-11-10, runbook drafted; implementation waits on owner sandbox-credential confirmation + sandbox-call go-ahead) | APPROVED 2026-11-04 | scope/PF-SCOPE-004-ebay-sandbox-proof |
| PF-SCOPE-005 | Vendor-agnostic AI (draft-only, evaluated) | APPROVED (waits on PF-SCOPE-004 + provider key + evaluation bar + separate AI-credential approval) | APPROVED 2026-11-04 | — |
| PF-SCOPE-008 | Core alignment follow-up (Node-resolvable core entry + provably-identical helpers) | APPROVED (buildable; runs before the mobile Inventory split) | APPROVED 2026-11-04 | — |
| PF-SCOPE-009 | Mobile Inventory split (explore.tsx, move-only) | PROPOSED (drafted 2026-11-04; approval pending; PF-D-013 governance amendment also pending) | — | — |
| PF-SCOPE-006 | Web adopts the shared packages (partial, equivalence-proven sites) | CLOSED (VERIFIED 2026-11-11: getItemPhotos adopted at the 3 proven-identical sites + 49 equivalence tests; remaining families stay web-side deliberately per Findings, owner-accepted partial 2026-11-04; integrated onto current main; browser pass green) | APPROVED 2026-11-04 | scope/PF-SCOPE-006-integration |
| PF-SCOPE-007 | Config hygiene: settle the audit-flagged defaults | CLOSED (VERIFIED 2026-11-10: three defaults implemented + tested; integrated onto current main — sole conflict was this register; Render dashboard read matches render.yaml, EBAY_ENVIRONMENT=sandbox, PALLETSCANNER_ALLOWED_ORIGIN unset) | APPROVED 2026-11-04 | scope/PF-SCOPE-007-config-hygiene |
| PF-SCOPE-014 | Pallets archive like items (no more hard-delete dead end) | CLOSED (VERIFIED 2026-11-09: owner removed a stuck self-test pallet on main, end-to-end) | APPROVED 2026-11-07 | scope/PF-SCOPE-014-pallet-archiving |
| PF-SCOPE-017 | Slate design port — web + mobile (experiment) | CLOSED (VERIFIED 2026-11-09: merged PR #13; owner's live pass on main; findings became PF-SCOPE-018/019) | APPROVED to build 2026-11-08; shipping approved 2026-11-08 ("Ship it — open the PR to main") | experiment/design-slate-port |
| PF-SCOPE-013 | Mobile item editor: keyboard can be dismissed and no longer traps the form | CLOSED (merged 2026-11-09 via PR #14 as 345659bb, superseding unmergeable PR #10; owner device retest PASSED 2026-11-10 from the PF-SCOPE-016 preview build) | APPROVED 2026-11-07; merge approved 2026-11-09 ("merge it, retest on main") | scope/PF-SCOPE-013-keyboard-on-main |
| PF-SCOPE-016 | Phone test builds via TestFlight + EAS Update | CLOSED (VERIFIED 2026-11-10: CI workflow + preview channel live; first interactive build established Apple credentials on EAS; build-env fix PR #20; CI-dispatched build c21ecba7 installed, sign-in + PF-SCOPE-013 check passed. Preview profile ships direct-install builds; TestFlight record exists if a store-distribution variant is wanted) | APPROVED 2026-11-07 | — |
| PF-SCOPE-015 | Web preview hosting + Lenard-run browser passes | IN_PROGRESS | APPROVED 2026-11-07 | scope/PF-SCOPE-015-web-preview-testing |
| PF-SCOPE-019 | Mobile switches: one treatment, visible in both themes | CLOSED (VERIFIED 2026-11-09: merged PR #16; owner device check — Day switches visible, amber on, Deep unchanged) | APPROVED 2026-11-09 (owner phone-pass finding) | scope/PF-SCOPE-019-mobile-switches |
| PF-SCOPE-018 | Web live-pass fixes: Inventory cards, compact Orders toggle, Deep separation, dialog structure, Edit form facelift | IN_PROGRESS | APPROVED 2026-11-09 (owner live-pass findings; "build all 5") | scope/PF-SCOPE-018-live-pass-fixes |
| PF-SCOPE-012 | Web cloud saves translate workflow status to the database vocabulary | CLOSED (VERIFIED 2026-11-07; PR #9 merged; register flip landed 2026-11-10 with the PF-SCOPE-003 successor) | APPROVED 2026-11-07 | scope/PF-SCOPE-012-web-cloud-status-translation |
| PF-SCOPE-011 | Clients create the acquisition for each new pallet | CLOSED | APPROVED 2026-11-07 | scope/PF-SCOPE-011-acquisition-creation |
| PF-SCOPE-010 | Hosted Supabase schema alignment | CLOSED | APPROVED 2026-11-07 (Stage A; Stage B separate go-ahead) | — (dashboard-applied; record rides PF-SCOPE-011's branch) |

Scope document for PF-SCOPE-001: `project-control/PF-SCOPE-001-verification-harness.md`. Scope document for PF-SCOPE-004: `project-control/PF-SCOPE-004-ebay-sandbox-proof.md`. Scope document for PF-SCOPE-007: `project-control/PF-SCOPE-007-config-hygiene.md`. Use `SCOPE_PROTOCOL.md` for the required proposal template and lifecycle. Add links to scope-specific documents and PRs as work progresses.

## Numbering note (do not remove)

The register as written before the 2026-11-03 audit used different illustrative titles for the same IDs. The audit proposed revised scopes, and the owner approved the revised descriptions above. The renumbering is recorded here so it is not a silent overwrite:

- Illustrative PF-SCOPE-001 (pre-audit): Mobile scan/photo → draft → save → next-item reliability — now the approved PF-SCOPE-002 description.
- Illustrative PF-SCOPE-002 (pre-audit): Web Review/Inventory decision and editing completion — covered by the approved PF-SCOPE-003 description.
- Illustrative PF-SCOPE-003 (pre-audit): Mobile/web sync, error recovery and regression tests — covered by the approved PF-SCOPE-003 description.
- Approved PF-SCOPE-001 (verification harness + CI) had no illustrative counterpart; it was added by the audit as the prerequisite first scope.
