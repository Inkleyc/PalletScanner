-- Keep compatibility quantity aligned to the ledger without auditing the cache write twice.
create or replace function public.audit_compatibility_quantity_change()
returns trigger language plpgsql security invoker set search_path = public as $$
declare quantity_delta integer;
begin
  if current_setting('palletflip.skip_quantity_audit', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then quantity_delta := new.quantity; else quantity_delta := new.quantity - old.quantity; end if;
  if quantity_delta = 0 then return new; end if;
  insert into public.inventory_movements (business_id, owner_id, inventory_item_id, quantity, movement_type, reason, source_type, source_id, idempotency_key)
  values (new.business_id, new.owner_id, new.id, quantity_delta,
    case when tg_op = 'INSERT' then 'receipt' else 'correction' end,
    case when tg_op = 'INSERT' then 'Inventory received through compatibility client' else coalesce(nullif(trim(new.last_quantity_reason), ''), 'Quantity changed through compatibility client') end,
    'inventory_item_quantity', new.client_id::text,
    case when tg_op = 'INSERT' then 'item-opening-receipt:' || new.id::text else 'item-quantity-correction:' || gen_random_uuid()::text end)
  on conflict (business_id, idempotency_key) do nothing;
  return new;
end;
$$;

create or replace function public.refresh_inventory_item_balance(target_item_id uuid, target_business_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare calculated_on_hand integer; calculated_reserved integer; calculated_shortage integer;
begin
  select coalesce(sum(quantity), 0)::integer into calculated_on_hand from public.inventory_movements
  where inventory_item_id = target_item_id and business_id = target_business_id;
  select
    coalesce(sum(greatest(reserved_quantity - released_quantity - consumed_quantity, 0)) filter (where state in ('active', 'shortage')), 0)::integer,
    coalesce(sum(shortage_quantity) filter (where state in ('active', 'shortage')), 0)::integer
  into calculated_reserved, calculated_shortage from public.inventory_reservations
  where inventory_item_id = target_item_id and business_id = target_business_id;
  perform set_config('palletflip.skip_quantity_audit', 'on', true);
  update public.inventory_items set quantity = calculated_on_hand, on_hand = calculated_on_hand,
    reserved = calculated_reserved, available = greatest(calculated_on_hand - calculated_reserved, 0),
    shortage = greatest(calculated_shortage, calculated_reserved - calculated_on_hand, 0)
  where id = target_item_id and business_id = target_business_id;
  perform set_config('palletflip.skip_quantity_audit', 'off', true);
end;
$$;
