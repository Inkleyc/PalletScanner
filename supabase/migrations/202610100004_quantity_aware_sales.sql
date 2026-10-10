alter table public.sales
  add column if not exists quantity integer not null default 1
  check (quantity > 0);

create or replace function public.consume_inventory_for_sale()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_available integer;
begin
  select available
  into current_available
  from public.inventory_items
  where id = new.item_id
    and business_id = new.business_id
  for update;

  if current_available is null then
    raise exception 'Inventory item is unavailable for sale.';
  end if;
  if new.quantity > current_available then
    raise exception 'Sale quantity % exceeds available quantity %.',
      new.quantity, current_available;
  end if;

  insert into public.inventory_movements (
    business_id, owner_id, inventory_item_id, quantity, movement_type,
    reason, source_type, source_id, idempotency_key, occurred_at
  ) values (
    new.business_id,
    new.owner_id,
    new.item_id,
    -new.quantity,
    'sale',
    'Inventory consumed by recorded sale',
    'sale',
    new.id::text,
    'sale:' || new.id::text,
    new.sold_at
  )
  on conflict (business_id, idempotency_key) do nothing;
  return new;
end;
$$;

create trigger sales_consume_inventory
after insert on public.sales
for each row execute function public.consume_inventory_for_sale();
