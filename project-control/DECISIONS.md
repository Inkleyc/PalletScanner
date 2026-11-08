# PalletFlip Decision Register
Record approvals here with date, scope, rationale, and links. Never label a recommendation owner-approved.

## Confirmed by owner, 2026-11-03
- **PF-D-001:** Prioritize completion of mobile/web functionality and design over demo setup and release infrastructure.
- **PF-D-002:** Preserve prior product decisions and substantial existing work; no wholesale reinvention.
- **PF-D-003:** High autonomy for implementation inside a bounded, owner-approved scope.
- **PF-D-004:** New undocumented functionality, substantial workflow changes and material redesigns require owner approval.
- **PF-D-005:** Muse should proactively propose improvements and may prototype them on clearly documented isolated branches. No experimental changes to `main` without owner approval.
- **PF-D-006:** Every scope and experiment must stay within the PalletFlip product charter.
- **PF-D-007:** Muse proposes small scopes; owner approves each before autonomous execution.
- **PF-D-008:** Protected data, credential, production and live marketplace operations require separate explicit approval.

## Confirmed by owner, 2026-11-03 (alignment conversation)
Direction confirmed; implementation of each item still requires a separately approved scope. See `project-control/FUTURE_DIRECTIONS.md`.

- **PF-D-009:** PalletFlip is hobbyist/small-business first and open to feature discussion, with architecture seams that allow expansion to a more corporate tool. Do not build team/corporate administration now.
- **PF-D-010:** eBay remains the first marketplace. Other low-maintenance marketplaces may be added one at a time, with PalletFlip as inventory authority and cross-channel withdrawal/quantity updates when an item sells on another channel. Facebook remains assisted-only in the current product; Muse-assisted posting is an experiment idea only, not approved behaviour.
- **PF-D-011:** AI integration is wanted and vendor-agnostic — best AI for the purpose, not necessarily Claude/Anthropic. AI drafts; the owner decides. Re-enabling AI requires a separately approved scope; the handoff "do not re-enable AI" control remains in force until then.
- **PF-D-012:** Pallet/lot sourcing is deferred to a later version. Get the current operations scope built and running first; keep only a manual won-lot-to-pallet seam.

## Confirmed by owner, 2026-11-07
(PF-D-013 is reserved for the pending scope-governance amendment, still awaiting owner approval.)

- **PF-D-014:** Items and pallets share one removal model: archive, never hard-delete from the apps. Archived rows stay in the database (the append-only stock ledger makes hard deletion of stocked records impossible anyway) and leave every active view. An Archived view with restore is the approved follow-up direction, as its own future scope. Implemented by PF-SCOPE-014.
- **PF-D-015:** Deployment-for-testing is part of approved-scope autonomy. Lenard may deploy web preview builds (per-branch preview hosting) and mobile test builds (TestFlight / EAS Update), and may run the web browser passes and prepare device passes himself, recording evidence in the scope docs. Preview/test deployments are not a public launch: any production/public release still needs its own explicit owner decision, merges to `main` stay owner-gated, and hosted-database writes stay gated one by one (PF-D-008 unchanged). The Expo token used by CI lives only as a GitHub repository secret set by the owner; Lenard never holds it. Lenard's test records in the hosted database are named as test data and archived after the pass. Implemented by PF-SCOPE-015 (web) and PF-SCOPE-016 (mobile).

## Established historical direction; verify against code and current docs
- Mobile warehouse capture / web business management split.
- eBay integration and assisted Facebook Marketplace posting (do not assume an official automated posting API).
- US-first launch; monetization unresolved; owner dislikes ads.
- AI deferred after Anthropic credential revocation.
- Historical backlog: order UX, partial cancels/shipments, label synchronization, cancellation timing, oversell recovery. Verify which remain incomplete.

## Pending decisions
- First 2–3 development scopes and their acceptance criteria.
- Any proposed redesign or new capability.
- Safe local-development data setup and environment readiness.
- When to revisit AI, demos, TestFlight, release and monetization. (AI direction is confirmed in PF-D-011; timing, provider evaluation, and scope are pending.)
- Which marketplace, if any, is the second channel after eBay.
- Whether a supervised Muse-assisted posting experiment is worth running, and under what approval-per-listing rules.
- What would trigger revisiting team/corporate capabilities.

## New entry template
`PF-D-NNN | Date | Decision | Approved by owner? | Affected scope | Rationale | Affected docs/code`
