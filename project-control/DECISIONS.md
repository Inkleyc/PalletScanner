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
- When to revisit AI, demos, TestFlight, release and monetization.

## New entry template
`PF-D-NNN | Date | Decision | Approved by owner? | Affected scope | Rationale | Affected docs/code`
