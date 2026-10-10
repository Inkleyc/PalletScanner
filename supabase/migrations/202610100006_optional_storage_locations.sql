alter table public.inventory_items
  add column if not exists storage_location text;
