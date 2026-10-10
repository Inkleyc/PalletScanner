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
