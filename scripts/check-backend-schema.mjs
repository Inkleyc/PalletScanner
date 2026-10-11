import { readFile } from "node:fs/promises";

const schema = await readFile(
  new URL("../supabase/migrations/202609110001_initial_inventory.sql", import.meta.url),
  "utf8",
);
const inventoryAuthority = await readFile(
  new URL(
    "../supabase/migrations/202610100001_inventory_authority_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const quantityAudit = await readFile(
  new URL(
    "../supabase/migrations/202610100003_inventory_quantity_audit.sql",
    import.meta.url,
  ),
  "utf8",
);
const quantityAwareSales = await readFile(
  new URL(
    "../supabase/migrations/202610100004_quantity_aware_sales.sql",
    import.meta.url,
  ),
  "utf8",
);
const quantityAdjustmentReasons = await readFile(
  new URL(
    "../supabase/migrations/202610100005_quantity_adjustment_reasons.sql",
    import.meta.url,
  ),
  "utf8",
);
const optionalStorageLocations = await readFile(
  new URL(
    "../supabase/migrations/202610100006_optional_storage_locations.sql",
    import.meta.url,
  ),
  "utf8",
);
const automaticInventorySkus = await readFile(
  new URL(
    "../supabase/migrations/202610100007_automatic_inventory_skus.sql",
    import.meta.url,
  ),
  "utf8",
);
const inventoryReservationCommands = await readFile(
  new URL(
    "../supabase/migrations/202610100008_inventory_reservation_commands.sql",
    import.meta.url,
  ),
  "utf8",
);
const marketplaceObservationFoundation = await readFile(
  new URL(
    "../supabase/migrations/202610100009_marketplace_observation_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const marketplaceReconciliationDecisions = await readFile(
  new URL(
    "../supabase/migrations/202610100010_marketplace_reconciliation_decisions.sql",
    import.meta.url,
  ),
  "utf8",
);
const unverifiedImportedInventory = await readFile(
  new URL("../supabase/migrations/202610100011_unverified_imported_inventory.sql", import.meta.url),
  "utf8",
);
const verifyImportedInventory = await readFile(
  new URL("../supabase/migrations/202610100012_verify_imported_inventory.sql", import.meta.url),
  "utf8",
);
const importedMarketplaceListing = await readFile(
  new URL("../supabase/migrations/202610100013_link_imported_marketplace_listing.sql", import.meta.url),
  "utf8",
);
const legacyQuantitySync = await readFile(
  new URL("../supabase/migrations/202610100014_keep_legacy_quantity_in_sync.sql", import.meta.url),
  "utf8",
);
const orderImportFoundation = await readFile(
  new URL("../supabase/migrations/202610100015_order_import_foundation.sql", import.meta.url),
  "utf8",
);
const orderLineMatching = await readFile(
  new URL("../supabase/migrations/202610100016_match_order_line.sql", import.meta.url),
  "utf8",
);
const importedOrderReservation = await readFile(
  new URL("../supabase/migrations/202610100017_reserve_imported_order.sql", import.meta.url),
  "utf8",
);
const cancelledOrderRelease = await readFile(
  new URL("../supabase/migrations/202610100018_cancelled_order_release.sql", import.meta.url),
  "utf8",
);
const marketplaceQuantityQueue = await readFile(
  new URL("../supabase/migrations/202610100019_marketplace_quantity_queue.sql", import.meta.url),
  "utf8",
);
const marketplacePauseControl = await readFile(
  new URL("../supabase/migrations/202610100020_marketplace_pause_control.sql", import.meta.url),
  "utf8",
);
const marketplaceActionJobs = await readFile(
  new URL("../supabase/migrations/202610100021_marketplace_action_jobs.sql", import.meta.url),
  "utf8",
);
const marketplaceJobExecution = await readFile(
  new URL("../supabase/migrations/202610100022_marketplace_job_execution.sql", import.meta.url),
  "utf8",
);
const marketplaceJobRetry = await readFile(
  new URL("../supabase/migrations/202610100023_marketplace_job_retry.sql", import.meta.url),
  "utf8",
);
const finalUnitWithdrawal = await readFile(
  new URL("../supabase/migrations/202610100024_final_unit_withdrawal.sql", import.meta.url),
  "utf8",
);
const shippingFoundation = await readFile(
  new URL("../supabase/migrations/202610100025_shipping_foundation.sql", import.meta.url),
  "utf8",
);
const startOrderFulfillment = await readFile(
  new URL("../supabase/migrations/202610100026_start_order_fulfillment.sql", import.meta.url),
  "utf8",
);
const pickPackConfirmation = await readFile(
  new URL("../supabase/migrations/202610100027_pick_pack_confirmation.sql", import.meta.url),
  "utf8",
);
const recordShipmentLabel = await readFile(
  new URL("../supabase/migrations/202610100028_record_shipment_label.sql", import.meta.url),
  "utf8",
);
const confirmShipmentShipped = await readFile(
  new URL("../supabase/migrations/202610100029_confirm_shipment_shipped.sql", import.meta.url),
  "utf8",
);
const trackingEventCommand = await readFile(
  new URL("../supabase/migrations/202610100030_tracking_event_command.sql", import.meta.url),
  "utf8",
);
const returnsFoundation = await readFile(
  new URL("../supabase/migrations/202610100031_returns_foundation.sql", import.meta.url),
  "utf8",
);
const returnInventoryWorkflow = await readFile(
  new URL("../supabase/migrations/202610100032_return_receipt_inspection_disposition.sql", import.meta.url),
  "utf8",
);
const manualReturnIntake = await readFile(
  new URL("../supabase/migrations/202610100033_manual_return_intake.sql", import.meta.url),
  "utf8",
);
const returnFinancialEvents = await readFile(
  new URL("../supabase/migrations/202610100034_return_financial_events.sql", import.meta.url),
  "utf8",
);
const returnShippingHandoff = await readFile(
  new URL("../supabase/migrations/202610100035_return_shipping_handoff.sql", import.meta.url),
  "utf8",
);
const confirmedReturnDecisions = await readFile(
  new URL("../supabase/migrations/202610100036_confirmed_return_decisions.sql", import.meta.url),
  "utf8",
);
const returnCommunications = await readFile(
  new URL("../supabase/migrations/202610100037_return_communications.sql", import.meta.url),
  "utf8",
);
const returnIdentityEvidence = await readFile(
  new URL("../supabase/migrations/202610100038_return_identity_evidence.sql", import.meta.url),
  "utf8",
);
const returnIdentityResolution = await readFile(
  new URL("../supabase/migrations/202610100039_return_identity_resolution.sql", import.meta.url),
  "utf8",
);
const closeReturnCase = await readFile(
  new URL("../supabase/migrations/202610100040_close_return_case.sql", import.meta.url),
  "utf8",
);
const replacementFulfillment = await readFile(
  new URL("../supabase/migrations/202610100041_replacement_fulfillment.sql", import.meta.url),
  "utf8",
);
const shipmentSupplyCost = await readFile(
  new URL("../supabase/migrations/202610100042_shipment_supply_cost.sql", import.meta.url),
  "utf8",
);
const persistedListingPrice = await readFile(
  new URL("../supabase/migrations/202610100043_persist_listing_price.sql", import.meta.url),
  "utf8",
);
const listingPriceAudit = await readFile(
  new URL("../supabase/migrations/202610100044_listing_price_audit.sql", import.meta.url),
  "utf8",
);
const priceReconciliationDecisions = await readFile(
  new URL("../supabase/migrations/202610100045_price_reconciliation_decisions.sql", import.meta.url),
  "utf8",
);
const pricingRecommendationSettings = await readFile(
  new URL("../supabase/migrations/202610100046_pricing_recommendation_settings.sql", import.meta.url),
  "utf8",
);
const applyPricingRecommendation = await readFile(
  new URL("../supabase/migrations/202610100047_apply_pricing_recommendation.sql", import.meta.url),
  "utf8",
);
const pricingRecommendationDismissals = await readFile(
  new URL("../supabase/migrations/202610100048_pricing_recommendation_dismissals.sql", import.meta.url),
  "utf8",
);

for (const table of ["pallets", "inventory_items", "item_photos", "marketplace_listings", "sales", "activity_events"]) {
  if (!schema.includes(`create table public.${table}`)) {
    throw new Error(`Backend schema is missing ${table}.`);
  }
  if (!schema.includes(`alter table public.${table} enable row level security`)) {
    throw new Error(`Backend schema is missing row-level security for ${table}.`);
  }
}

for (const table of [
  "businesses",
  "business_memberships",
  "business_settings",
  "acquisitions",
  "inventory_movements",
  "inventory_reservations",
]) {
  if (!inventoryAuthority.includes(`create table public.${table}`)) {
    throw new Error(`Inventory authority schema is missing ${table}.`);
  }
  if (!inventoryAuthority.includes(`alter table public.${table} enable row level security`)) {
    throw new Error(`Inventory authority schema is missing row-level security for ${table}.`);
  }
}

for (const marker of [
  "acquisitions_one_loose_system_idx",
  "Opening balance migrated from legacy inventory",
  "Legacy sale migrated from sold inventory",
  "unique (business_id, idempotency_key)",
  "check (quantity <> 0)",
  "check (state in ('active', 'released', 'consumed', 'shortage'))",
  "owners append movements",
]) {
  if (!inventoryAuthority.includes(marker)) {
    throw new Error(`Inventory authority schema is missing safety marker: ${marker}`);
  }
}

for (const marker of ["verify_imported_inventory", "physical_import_verification", "for update", "inventory.import_verified", "counted_quantity < 0"]) {
  if (!verifyImportedInventory.includes(marker)) throw new Error(`Imported inventory verification is missing safety marker: ${marker}`);
}
for (const marker of ["link_imported_marketplace_listing", "inventory_items_link_imported_listing", "sync_paused = true", "on conflict (item_id, platform)"]) {
  if (!importedMarketplaceListing.includes(marker)) throw new Error(`Imported marketplace listing link is missing safety marker: ${marker}`);
}
for (const marker of ["palletflip.skip_quantity_audit", "quantity = calculated_on_hand", "item-quantity-correction:", "set_config('palletflip.skip_quantity_audit', 'off'"]) {
  if (!legacyQuantitySync.includes(marker)) throw new Error(`Legacy quantity synchronization is missing safety marker: ${marker}`);
}
for (const table of ["orders", "order_lines"]) {
  if (!orderImportFoundation.includes(`create table public.${table}`) || !orderImportFoundation.includes(`alter table public.${table} enable row level security`)) throw new Error(`Order import foundation is missing ${table}.`);
}
for (const marker of ["unique (business_id, source, external_order_id)", "unique (order_id, external_line_id)", "match_state in ('matched', 'uncertain', 'unmatched', 'conflicting')", "Reservation automation remains disabled"]) {
  if (!orderImportFoundation.includes(marker)) throw new Error(`Order import foundation is missing safety marker: ${marker}`);
}
for (const marker of ["match_order_line", "for update", "order_line.manually_matched", "'inventory_reserved', false", "business_id = line_row.business_id"]) {
  if (!orderLineMatching.includes(marker)) throw new Error(`Order-line matching is missing safety marker: ${marker}`);
}
for (const marker of ["reserve_imported_order", "protect_reserved_order_line", "A reserved order line cannot be rematched or changed", "Only paid orders can reserve inventory", "Every order line must be matched", "verification_state <> 'verified'", "order by item.id for update", "reservation_id is null", "order-line:", "No reservations were saved", "reserved_line_count > 0", "order.inventory_reserved"]) {
  if (!importedOrderReservation.includes(marker)) throw new Error(`Imported-order reservation is missing safety marker: ${marker}`);
}
for (const marker of ["cancellation_state", "release_cancelled_order_reservations", "eBay confirms cancellation", "release_inventory_reservation", "order.cancelled_inventory_released", "released_count > 0", "Cancelled or cancellation-pending orders cannot reserve inventory"]) {
  if (!cancelledOrderRelease.includes(marker)) throw new Error(`Cancelled-order release is missing safety marker: ${marker}`);
}
for (const marker of ["desired_quantity", "quantity_sync_state", "refresh_marketplace_quantity_intent", "after update of available", "observe_ebay_offer_quantity", "listing.sync_paused", "account.outbound_paused", "account.sync_mode from public.marketplace_accounts", "<> 'active'"]) {
  if (!marketplaceQuantityQueue.includes(marker)) throw new Error(`Marketplace quantity queue is missing safety marker: ${marker}`);
}
for (const marker of ["set_marketplace_outbound_pause", "for update", "when should_pause then 'paused'", "then 'review_required'", "marketplace.outbound_pause_changed", "outbound_paused', should_pause"]) {
  if (!marketplacePauseControl.includes(marker)) throw new Error(`Marketplace pause control is missing safety marker: ${marker}`);
}
for (const marker of ["create table public.marketplace_action_jobs", "unique (business_id, idempotency_key)", "queue_ebay_quantity_sync", "Outbound marketplace actions are paused or not approved", "verification_state <> 'verified'", "sku', listing_row.sku", "offer_id', listing_row.offer_id", "marketplace.quantity_sync_queued"]) {
  if (!marketplaceActionJobs.includes(marker)) throw new Error(`Marketplace action jobs are missing safety marker: ${marker}`);
}
for (const marker of ["claim_marketplace_action_job", "complete_marketplace_action_job", "fail_marketplace_action_job", "status = 'running'", "interval '5 minutes'", "attempt_count = attempt_count + 1", "power(2, attempt_count)", "marketplace.quantity_sync_succeeded", "marketplace.quantity_sync_failed"]) {
  if (!marketplaceJobExecution.includes(marker)) throw new Error(`Marketplace job execution is missing safety marker: ${marker}`);
}
for (const marker of ["retry_failed_marketplace_action_job", "status = 'failed' for update", "attempt_count = 0", "next_attempt_at = now()", "marketplace.action_retry_approved"]) {
  if (!marketplaceJobRetry.includes(marker)) throw new Error(`Marketplace job retry is missing safety marker: ${marker}`);
}
for (const marker of ["withdraw_listing", "desired_quantity = 0", "selected_action", "status = case when job_row.action_type = 'withdraw_listing' then 'ended'", "marketplace.final_unit_withdrawn"]) {
  if (!finalUnitWithdrawal.includes(marker)) throw new Error(`Final-unit withdrawal is missing safety marker: ${marker}`);
}
for (const table of ["package_presets", "shipments", "shipment_packages", "shipment_package_lines", "tracking_events"]) {
  if (!shippingFoundation.includes(`create table public.${table}`)) throw new Error(`Shipping foundation is missing ${table}.`);
  if (!shippingFoundation.includes(`alter table public.${table} enable row level security`)) throw new Error(`Shipping foundation is missing row-level security for ${table}.`);
}
for (const marker of ["item_weight_grams", "estimated_weight_grams", "final_weight_grams", "measurement_state", "ship_by_at", "local_pickup", "insurance_requested boolean not null default false"]) {
  if (!shippingFoundation.includes(marker)) throw new Error(`Shipping foundation is missing contract marker: ${marker}`);
}
for (const marker of ["start_order_fulfillment", "Only paid orders can enter fulfillment", "Every order line must have an active inventory reservation", "weighted_line_count = total_line_count", "shipment.fulfillment_started"]) {
  if (!startOrderFulfillment.includes(marker)) throw new Error(`Start-fulfillment command is missing safety marker: ${marker}`);
}
for (const marker of ["confirm_shipment_picked", "shipment.pick_confirmed", "confirm_shipment_package", "measurement_state = 'confirmed'", "state = 'ready_for_label'", "shipment.package_confirmed"]) {
  if (!pickPackConfirmation.includes(marker)) throw new Error(`Pick/pack confirmation is missing safety marker: ${marker}`);
}
for (const marker of ["supply_cost", "default_supply_cost", "confirm_shipment_package_with_cost", "confirmed_supply_cost < 0", "shipment.package_confirmed"]) {
  if (!shipmentSupplyCost.includes(marker)) throw new Error(`Shipment supply-cost tracking is missing safety marker: ${marker}`);
}
for (const marker of ["add column listing_price", "listing_price >= 0", "listing_price = high_price", "inventory.listing_price_backfilled", "existing_high_price"]) {
  if (!persistedListingPrice.includes(marker)) throw new Error(`Persisted listing price is missing contract marker: ${marker}`);
}
for (const marker of ["audit_inventory_listing_price_change", "after update of listing_price", "old.listing_price is distinct from new.listing_price", "inventory.listing_price_changed", "previous_price"]) {
  if (!listingPriceAudit.includes(marker)) throw new Error(`Listing-price audit is missing safety marker: ${marker}`);
}
for (const marker of ["resolve_marketplace_price_review", "keep_approved", "adopt_external", "for update", "marketplace.price_review_resolved", "outbound_marketplace_change', false"]) {
  if (!priceReconciliationDecisions.includes(marker)) throw new Error(`Price reconciliation is missing safety marker: ${marker}`);
}
for (const marker of ["pricing_recommendations_enabled", "pricing_review_after_days between 7 and 365", "pricing_markdown_percent", "update_pricing_recommendation_settings", "allows_outbound_price_changes', false"]) {
  if (!pricingRecommendationSettings.includes(marker)) throw new Error(`Pricing recommendation settings are missing safety marker: ${marker}`);
}
for (const marker of ["apply_pricing_recommendation", "status <> 'active'", "pricing_recommendations_enabled", "greatest(item_row.floor_price", "The recommendation changed", "pricing.recommendation_applied", "outbound_marketplace_change', false"]) {
  if (!applyPricingRecommendation.includes(marker)) throw new Error(`Pricing recommendation approval is missing safety marker: ${marker}`);
}
for (const marker of ["create table public.pricing_recommendation_decisions", "enable row level security", "dismiss_pricing_recommendation", "revisit_after", "security definer", "pricing.recommendation_dismissed", "outbound_marketplace_change', false"]) {
  if (!pricingRecommendationDismissals.includes(marker)) throw new Error(`Pricing recommendation dismissal is missing safety marker: ${marker}`);
}
for (const marker of ["record_shipment_label", "state <> 'ready_for_label'", "state = 'label_purchased'", "final_shipping_cost", "shipment.label_recorded"]) {
  if (!recordShipmentLabel.includes(marker)) throw new Error(`Shipment-label recording is missing safety marker: ${marker}`);
}
for (const marker of ["confirm_shipment_shipped", "state <> 'label_purchased'", "reservation_row.inventory_item_id <> line_row.inventory_item_id", "reservation_row.source_type <> 'marketplace_order_line'", "Inventory consumed at confirmed carrier handoff", "state = 'consumed'", "state = 'shipped'", "shipment.carrier_handoff_confirmed"]) {
  if (!confirmShipmentShipped.includes(marker)) throw new Error(`Shipment confirmation is missing safety marker: ${marker}`);
}
for (const marker of ["record_tracking_event", "out_for_delivery", "external_event_id = trim(tracking_event_key)", "state = case when tracking_status = 'delivered'", "then 'shipped'", "shipment.tracking_event_recorded"]) {
  if (!trackingEventCommand.includes(marker)) throw new Error(`Tracking-event command is missing safety marker: ${marker}`);
}
for (const table of ["returns", "return_lines", "return_inspections", "return_financial_events"]) {
  if (!returnsFoundation.includes(`create table public.${table}`)) throw new Error(`Returns foundation is missing ${table}.`);
  if (!returnsFoundation.includes(`alter table public.${table} enable row level security`)) throw new Error(`Returns foundation is missing row-level security for ${table}.`);
}
for (const marker of ["action_due_at", "inventory_state", "recommended_disposition", "partial_refund", "return_shipping", "returns_work_queue_idx"]) {
  if (!returnsFoundation.includes(marker)) throw new Error(`Returns foundation is missing contract marker: ${marker}`);
}
for (const marker of ["receive_return_line", "return_quarantine", "return.inventory_received_quarantined", "inspect_return_line", "return.inventory_inspected", "disposition_return_line", "Inspect the return before choosing its disposition", "return.inventory_dispositioned"]) {
  if (!returnInventoryWorkflow.includes(marker)) throw new Error(`Return inventory workflow is missing safety marker: ${marker}`);
}
for (const marker of ["create_manual_return", "Only shipped orders can start a return", "Open and completed returns cannot exceed", "manual:", "inventory_state", "return.manual_created"]) {
  if (!manualReturnIntake.includes(marker)) throw new Error(`Manual return intake is missing safety marker: ${marker}`);
}
for (const marker of ["record_return_financial_event", "partial_refund", "fee_credit", "external_event_id = trim(financial_event_key)", "return.financial_event_recorded"]) {
  if (!returnFinancialEvents.includes(marker)) throw new Error(`Return financial command is missing safety marker: ${marker}`);
}
for (const marker of ["record_return_shipping_handoff", "label_payer", "state = 'in_transit'", "A different return shipment is already recorded", "return-label:", "return.shipping_handoff_recorded"]) {
  if (!returnShippingHandoff.includes(marker)) throw new Error(`Return shipping handoff is missing safety marker: ${marker}`);
}
for (const marker of ["create table public.return_decisions", "record_confirmed_return_decision", "marketplace_confirmation is not true", "Confirm the decision succeeded in eBay", "changes_inventory', false", "records_financial_event', false", "return.marketplace_decision_confirmed"]) {
  if (!confirmedReturnDecisions.includes(marker)) throw new Error(`Confirmed return decision is missing safety marker: ${marker}`);
}
for (const marker of ["create table public.return_communications", "record_return_communication", "Confirm the message exists in eBay", "unique (return_id, external_event_id)", "message_submitted_by_palletflip', false", "return.communication_recorded"]) {
  if (!returnCommunications.includes(marker)) throw new Error(`Return communication history is missing safety marker: ${marker}`);
}
for (const marker of ["serial_number", "create table public.return_evidence", "return-evidence", "inspect_return_line_with_identity", "Both serial numbers are required", "photo evidence is required", "identity_mismatch_quarantined", "protect_mismatched_return_disposition", "must remain quarantined", "revoke execute on function public.inspect_return_line"]) {
  if (!returnIdentityEvidence.includes(marker)) throw new Error(`Return identity evidence is missing safety marker: ${marker}`);
}
for (const marker of ["create table public.return_identity_resolutions", "resolve_return_identity_discrepancy", "identity_verified", "wrong_item_nonstock", "No identity mismatch is recorded", "restock_permitted", "A confirmed wrong item cannot be returned to sellable inventory"]) {
  if (!returnIdentityResolution.includes(marker)) throw new Error(`Return identity resolution is missing safety marker: ${marker}`);
}
for (const marker of ["close_return_case", "inventory_outcome", "financial_outcome", "Record the confirmed return decision before closure", "Received return inventory must be inspected and dispositioned", "explicitly confirm that no inventory will return", "explicitly mark it not applicable", "return.case_closed"]) {
  if (!closeReturnCase.includes(marker)) throw new Error(`Return closure command is missing safety marker: ${marker}`);
}
for (const marker of ["shipment_kind", "create table public.replacement_shipment_lines", "start_return_replacement", "A confirmed replacement decision is required", "return_replacement", "Replacement inventory could not be fully reserved", "movement_type in (", "'replacement'", "Every replacement line must have its own active reservation", "return.replacement_carrier_handoff_confirmed", "replacement-label:", "'replacement_shipping'", "protect_replacement_return_closure", "must reach carrier handoff before closing"]) {
  if (!replacementFulfillment.includes(marker)) throw new Error(`Replacement fulfillment is missing safety marker: ${marker}`);
}

for (const marker of [
  "verification_state in ('verified', 'unverified_import')",
  "inventory_items_source_observation_idx",
  "create_unverified_inventory_from_observation",
  "A current create-new reconciliation decision is required.",
  "quantity >= 0",
  "pg_advisory_xact_lock",
  "quantity, workflow_status, verification_state",
]) {
  if (!unverifiedImportedInventory.includes(marker)) {
    throw new Error(`Unverified imported inventory schema is missing safety marker: ${marker}`);
  }
}

if (!marketplaceReconciliationDecisions.includes("create table public.marketplace_reconciliation_decisions")) {
  throw new Error("Marketplace reconciliation decision schema is missing its decision table.");
}
for (const marker of [
  "decision_type in ('match_existing', 'create_new', 'ignore', 'defer')",
  "decision_type = 'match_existing' and inventory_item_id is not null",
  "alter table public.marketplace_reconciliation_decisions enable row level security",
  "owners append marketplace reconciliation decisions",
]) {
  if (!marketplaceReconciliationDecisions.includes(marker)) {
    throw new Error(`Marketplace reconciliation decision schema is missing safety marker: ${marker}`);
  }
}

for (const table of ["marketplace_accounts", "marketplace_import_runs", "marketplace_observations"]) {
  if (!marketplaceObservationFoundation.includes(`create table public.${table}`)) {
    throw new Error(`Marketplace observation schema is missing ${table}.`);
  }
  if (!marketplaceObservationFoundation.includes(`alter table public.${table} enable row level security`)) {
    throw new Error(`Marketplace observation schema is missing row-level security for ${table}.`);
  }
}

for (const marker of [
  "sync_mode in ('observe_only', 'review_required', 'active', 'paused')",
  "outbound_paused boolean not null default true",
  "check (mode = 'observe_only')",
  "reconciliation_state in ('matched', 'uncertain', 'unmatched', 'conflicting')",
  "marketplace_listings_external_listing_idx",
  "marketplace_listings_external_offer_idx",
  "alter table public.marketplace_listings alter column item_id drop not null",
  "owners append marketplace observations",
  "owners complete marketplace import runs",
]) {
  if (!marketplaceObservationFoundation.includes(marker)) {
    throw new Error(`Marketplace observation schema is missing safety marker: ${marker}`);
  }
}

for (const marker of [
  "reserve_inventory",
  "release_inventory_reservation",
  "for update",
  "least(requested_units, item_row.available)",
  "reservation_idempotency_key",
  "state in ('active', 'shortage')",
  "to authenticated",
]) {
  if (!inventoryReservationCommands.includes(marker)) {
    throw new Error(`Inventory reservation commands are missing safety marker: ${marker}`);
  }
}

if (!optionalStorageLocations.includes("add column if not exists storage_location text")) {
  throw new Error("Optional storage-location schema is missing its inventory field.");
}

for (const marker of [
  "assign_inventory_sku",
  "inventory_items_assign_sku",
  "automatic_sku_enabled",
  "'PF-' || new.client_id::text",
]) {
  if (!automaticInventorySkus.includes(marker)) {
    throw new Error(`Automatic SKU schema is missing safety marker: ${marker}`);
  }
}

for (const marker of [
  "last_quantity_reason",
  "adjustment_reason",
  "nullif(trim(new.last_quantity_reason), '')",
]) {
  if (!quantityAdjustmentReasons.includes(marker)) {
    throw new Error(`Quantity-reason schema is missing safety marker: ${marker}`);
  }
}

for (const marker of [
  "add column if not exists quantity",
  "consume_inventory_for_sale",
  "sales_consume_inventory",
  "'sale:' || new.id::text",
  "for update",
  "exceeds available quantity",
]) {
  if (!quantityAwareSales.includes(marker)) {
    throw new Error(`Quantity-aware sales schema is missing safety marker: ${marker}`);
  }
}

for (const marker of [
  "refresh_inventory_item_balance",
  "inventory_items_audit_quantity",
  "inventory_movements_refresh_balance",
  "inventory_reservations_refresh_balance",
  "Quantity changed through compatibility client",
  "greatest(calculated_on_hand - calculated_reserved, 0)",
]) {
  if (!quantityAudit.includes(marker)) {
    throw new Error(`Quantity audit schema is missing safety marker: ${marker}`);
  }
}

for (const marker of [
  "references auth.users(id) on delete cascade",
  "unique (owner_id, client_id)",
  "item-photos",
  "storage.foldername(name)",
  "owners append activity",
  "foreign key (pallet_id, owner_id)",
  "foreign key (item_id, owner_id)",
]) {
  if (!schema.includes(marker)) {
    throw new Error(`Backend schema is missing required safety marker: ${marker}`);
  }
}

console.log("Backend schema contract check passed.");
