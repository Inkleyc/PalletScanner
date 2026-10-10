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
