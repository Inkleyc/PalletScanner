alter table public.inventory_items
  add column if not exists last_quantity_reason text;

create or replace function public.audit_compatibility_quantity_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  quantity_delta integer;
  adjustment_reason text;
begin
  if tg_op = 'INSERT' then
    quantity_delta := new.quantity;
    adjustment_reason := 'Inventory received through compatibility client';
  else
    quantity_delta := new.quantity - old.quantity;
    adjustment_reason := coalesce(
      nullif(trim(new.last_quantity_reason), ''),
      'Quantity changed through compatibility client'
    );
  end if;

  if quantity_delta = 0 then
    return new;
  end if;

  insert into public.inventory_movements (
    business_id, owner_id, inventory_item_id, quantity, movement_type,
    reason, source_type, source_id, idempotency_key
  ) values (
    new.business_id,
    new.owner_id,
    new.id,
    quantity_delta,
    case when tg_op = 'INSERT' then 'receipt' else 'correction' end,
    adjustment_reason,
    'inventory_item_quantity',
    new.client_id::text,
    case
      when tg_op = 'INSERT' then 'item-opening-receipt:' || new.id::text
      else 'item-quantity-correction:' || gen_random_uuid()::text
    end
  )
  on conflict (business_id, idempotency_key) do nothing;

  return new;
end;
$$;
