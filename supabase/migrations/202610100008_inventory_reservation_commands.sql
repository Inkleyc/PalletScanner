create or replace function public.refresh_inventory_item_balance(
  target_item_id uuid,
  target_business_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  calculated_on_hand integer;
  calculated_reserved integer;
  calculated_shortage integer;
begin
  select coalesce(sum(quantity), 0)::integer
  into calculated_on_hand
  from public.inventory_movements
  where inventory_item_id = target_item_id
    and business_id = target_business_id;

  select
    coalesce(sum(greatest(reserved_quantity - released_quantity - consumed_quantity, 0))
      filter (where state in ('active', 'shortage')), 0)::integer,
    coalesce(sum(shortage_quantity)
      filter (where state in ('active', 'shortage')), 0)::integer
  into calculated_reserved, calculated_shortage
  from public.inventory_reservations
  where inventory_item_id = target_item_id
    and business_id = target_business_id;

  update public.inventory_items
  set on_hand = calculated_on_hand,
      reserved = calculated_reserved,
      available = greatest(calculated_on_hand - calculated_reserved, 0),
      shortage = greatest(calculated_shortage, calculated_reserved - calculated_on_hand, 0)
  where id = target_item_id
    and business_id = target_business_id;
end;
$$;

create or replace function public.reserve_inventory(
  target_item_id uuid,
  reservation_source_type text,
  reservation_source_id text,
  requested_units integer,
  reservation_idempotency_key text
)
returns public.inventory_reservations
language plpgsql
security invoker
set search_path = public
as $$
declare
  item_row public.inventory_items%rowtype;
  existing_reservation public.inventory_reservations%rowtype;
  created_reservation public.inventory_reservations%rowtype;
  units_to_reserve integer;
begin
  if requested_units <= 0 then
    raise exception 'Requested quantity must be greater than zero.';
  end if;
  if nullif(trim(reservation_source_type), '') is null
    or nullif(trim(reservation_source_id), '') is null
    or nullif(trim(reservation_idempotency_key), '') is null then
    raise exception 'Reservation source and idempotency key are required.';
  end if;

  select * into item_row
  from public.inventory_items
  where id = target_item_id
    and owner_id = auth.uid()
    and archived_at is null
  for update;

  if not found then
    raise exception 'Active inventory item was not found.';
  end if;

  select * into existing_reservation
  from public.inventory_reservations
  where business_id = item_row.business_id
    and idempotency_key = reservation_idempotency_key;
  if found then
    return existing_reservation;
  end if;

  units_to_reserve := least(requested_units, item_row.available);
  insert into public.inventory_reservations (
    business_id, owner_id, inventory_item_id, source_type, source_id,
    requested_quantity, reserved_quantity, shortage_quantity, state,
    idempotency_key
  ) values (
    item_row.business_id,
    item_row.owner_id,
    item_row.id,
    trim(reservation_source_type),
    trim(reservation_source_id),
    requested_units,
    units_to_reserve,
    requested_units - units_to_reserve,
    case when requested_units > units_to_reserve then 'shortage' else 'active' end,
    trim(reservation_idempotency_key)
  )
  returning * into created_reservation;

  return created_reservation;
end;
$$;

create or replace function public.release_inventory_reservation(
  target_reservation_id uuid
)
returns public.inventory_reservations
language plpgsql
security invoker
set search_path = public
as $$
declare
  released_reservation public.inventory_reservations%rowtype;
begin
  update public.inventory_reservations
  set released_quantity = reserved_quantity,
      shortage_quantity = 0,
      state = 'released'
  where id = target_reservation_id
    and owner_id = auth.uid()
    and state in ('active', 'shortage')
  returning * into released_reservation;

  if not found then
    raise exception 'Active reservation was not found.';
  end if;
  return released_reservation;
end;
$$;

revoke all on function public.reserve_inventory(uuid, text, text, integer, text) from public;
grant execute on function public.reserve_inventory(uuid, text, text, integer, text) to authenticated;
revoke all on function public.release_inventory_reservation(uuid) from public;
grant execute on function public.release_inventory_reservation(uuid) to authenticated;
