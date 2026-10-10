alter table public.inventory_items
  add column if not exists product_barcode text;

create index if not exists inventory_items_business_barcode_idx
on public.inventory_items(business_id, product_barcode)
where product_barcode is not null;
