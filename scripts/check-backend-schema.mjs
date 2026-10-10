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
