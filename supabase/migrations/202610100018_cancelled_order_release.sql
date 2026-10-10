-- Preserve marketplace cancellation state and safely release committed inventory.
alter table public.orders add column cancellation_state text not null default 'none_requested';

create or replace function public.release_cancelled_order_reservations(target_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  line_row public.order_lines%rowtype;
  released_count integer := 0;
begin
  select * into order_row from public.orders
  where id = target_order_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Imported order was not found.'; end if;
  if lower(order_row.cancellation_state) <> 'canceled' then
    raise exception 'Reservations can only be released after eBay confirms cancellation.';
  end if;

  for line_row in
    select * from public.order_lines where order_id = order_row.id order by id for update
  loop
    if line_row.reservation_id is not null and exists (
      select 1 from public.inventory_reservations
      where id = line_row.reservation_id and state in ('active', 'shortage')
    ) then
      perform public.release_inventory_reservation(line_row.reservation_id);
      released_count := released_count + 1;
    end if;
  end loop;

  if released_count > 0 then
    insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
    values (order_row.business_id, order_row.owner_id, 'order.cancelled_inventory_released', order_row.id::text,
      jsonb_build_object('external_order_id', order_row.external_order_id, 'released_lines', released_count));
  end if;
  return released_count;
end;
$$;

revoke all on function public.release_cancelled_order_reservations(uuid) from public;
grant execute on function public.release_cancelled_order_reservations(uuid) to authenticated;

create or replace function public.protect_reserved_order_line()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.reservation_id is not null and (
    new.inventory_item_id is distinct from old.inventory_item_id
    or new.quantity is distinct from old.quantity
    or new.match_state is distinct from old.match_state
    or new.reservation_id is distinct from old.reservation_id
  ) then raise exception 'A reserved order line cannot be rematched or changed.'; end if;
  if old.reservation_id is null and new.reservation_id is not null and exists (
    select 1 from public.orders
    where id = new.order_id and lower(cancellation_state) <> 'none_requested'
  ) then
    raise exception 'Cancelled or cancellation-pending orders cannot reserve inventory.';
  end if;
  return new;
end;
$$;
