# Return Lifecycle Validation

Phase 5 has a complete guarded implementation contract from intake through
closure. `npm run return:lifecycle-check` verifies the cross-migration and web
workflow invariants below on every full repository check.

## Validated Paths

| Path | Required result |
| --- | --- |
| eBay or manual intake | Stable external/client identity; inventory remains unavailable. |
| Decision and communication | Explicit confirmation; audit history; no false claim that PalletFlip submitted an eBay action. |
| Return label | External handoff records payer, cost, carrier, and tracking idempotently. |
| Receipt | Positive receipt movement plus an equal quarantine reservation. |
| Inspection | Condition, completeness, identity, serials, notes, and evidence remain attached to the return line. |
| Identity mismatch | Evidence required; urgent exception; database-enforced quarantine. |
| Identity resolution | Verified identity may use normal dispositions; a wrong item can never become sellable stock. |
| Disposition | Restock/revise/repair release quarantine; non-stock outcomes consume quarantined quantity once. |
| Financial outcome | Refunds, fee credits, and shipping costs remain append-only and separate from the original sale. |
| Replacement | New verified stock receives its own reservation and shipment; original sale inventory is never consumed twice. |
| Closure | Confirmed decision, inventory outcome, financial outcome, notes, and completed replacement handoff are mandatory. |

## Environment Boundaries

The automated contract check validates repository wiring and safety markers; the
full build additionally validates JavaScript, TypeScript, and dashboard output.
This workstation does not have a local Supabase CLI/database, so transactional
RPC execution still requires a staged Supabase project before market release.

eBay Post-Order return search and decision methods are not supported in eBay
Sandbox. Production testing must therefore use a controlled seller account and
must validate any required digital signatures before direct decision or message
submission is enabled. Until that gate passes, PalletFlip uses observe-only
imports and explicit guided handoffs.

## Owner Acceptance Run

Before beta, complete at least these real staged cases:

1. imported return, normal receipt, inspection, restock, refund, closure;
2. refund without return with explicit inventory-not-applicable closure;
3. damaged return with evidence and loss/discard disposition;
4. serial mismatch, evidence upload, quarantine, and verified resolution;
5. approved replacement through pick, pack, label, carrier handoff, and closure;
6. replay every external identifier and confirm no duplicate inventory or money;
7. attempt every invalid transition and confirm the database rejects it.
