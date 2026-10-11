import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  foundation, workflow, manualIntake, finances, shipping, decisions,
  communications, identity, identityResolution, closure, replacement, lineRefunds, repository, app,
] = await Promise.all([
  read("../supabase/migrations/202610100031_returns_foundation.sql"),
  read("../supabase/migrations/202610100032_return_receipt_inspection_disposition.sql"),
  read("../supabase/migrations/202610100033_manual_return_intake.sql"),
  read("../supabase/migrations/202610100034_return_financial_events.sql"),
  read("../supabase/migrations/202610100035_return_shipping_handoff.sql"),
  read("../supabase/migrations/202610100036_confirmed_return_decisions.sql"),
  read("../supabase/migrations/202610100037_return_communications.sql"),
  read("../supabase/migrations/202610100038_return_identity_evidence.sql"),
  read("../supabase/migrations/202610100039_return_identity_resolution.sql"),
  read("../supabase/migrations/202610100040_close_return_case.sql"),
  read("../supabase/migrations/202610100041_replacement_fulfillment.sql"),
  read("../supabase/migrations/202610110007_line_attributed_refunds.sql"),
  read("../apps/web/src/marketplace-observation-repository.js"),
  read("../apps/web/src/App.jsx"),
]);

const scenarios = [
  ["observe-only intake never restocks", repository, ["importObservedEbayReturns", 'inventory_state: "unavailable"']],
  ["manual intake is idempotent and quantity bounded", manualIntake, ["create_manual_return", "Open and completed returns cannot exceed", "manual:"]],
  ["receipt quarantines every returned unit", workflow, ["return_receipt", "return_quarantine", "reserved_quantity <> line_row.quantity"]],
  ["inspection precedes disposition", workflow, ["Inspect the return before choosing its disposition", "quarantine_reservation_id"]],
  ["financial history is append-only", finances, ["record_return_financial_event", "external_event_id = trim(financial_event_key)"]],
  ["partial refunds are line and quantity attributed", lineRefunds, ["record_return_line_refund", "return_line_id", "refunded_quantity", "Refund quantity exceeds fulfilled quantity"]],
  ["line refunds are idempotent and audited", lineRefunds, ["external_event_id = trim(refund_event_key)", "return.line_refund_recorded", "for update"]],
  ["return shipping is an external handoff", shipping, ["record_return_shipping_handoff", "return-label:", "A different return shipment is already recorded"]],
  ["marketplace decisions require confirmation", decisions, ["marketplace_confirmation is not true", "changes_inventory', false", "records_financial_event', false"]],
  ["messages are recorded but not falsely submitted", communications, ["Confirm the message exists in eBay", "message_submitted_by_palletflip', false"]],
  ["identity mismatch requires evidence and quarantine", identity, ["photo evidence is required", "identity_mismatch_quarantined", "protect_mismatched_return_disposition"]],
  ["wrong items cannot become sellable stock", identityResolution, ["wrong_item_nonstock", "A confirmed wrong item cannot be returned to sellable inventory"]],
  ["closure requires physical and financial outcomes", closure, ["Received return inventory must be inspected and dispositioned", "explicitly mark it not applicable", "return.case_closed"]],
  ["replacement inventory has its own reservation", replacement, ["return_replacement", "replacement_shipment_lines", "Every replacement line must have its own active reservation"]],
  ["replacement carrier handoff is idempotent", replacement, ["replacement-shipment:", "on conflict (business_id, idempotency_key) do nothing", "return.replacement_carrier_handoff_confirmed"]],
  ["replacement cases cannot close before handoff", replacement, ["protect_replacement_return_closure", "must reach carrier handoff before closing"]],
  ["web workflow exposes every guarded stage", app, ["Record confirmed eBay decision", "Add evidence", "Resolve identity discrepancy", "Start replacement fulfillment", "Close return"]],
  ["return data remains owner scoped", foundation, ["owners manage returns", "owners manage return lines", "owners manage return inspections"]],
];

for (const [name, source, markers] of scenarios) {
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Return lifecycle scenario failed: ${name} is missing ${marker}`);
  }
}

console.log(`Return lifecycle contract check passed (${scenarios.length} guarded scenarios).`);
