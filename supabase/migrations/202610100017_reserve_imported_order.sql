-- Explicit, atomic reservation for a fully reviewed imported order.
alter table public.inventory_reservations add constraint inventory_reservations_id_business_unique unique (id, business_id);
alter table public.order_lines add column reservation_id uuid;
alter table public.order_lines add constraint order_lines_reservation_business_fk
  foreign key (reservation_id, business_id)
  references public.inventory_reservations(id, business_id) on delete restrict;

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
  return new;
end;
$$;

create trigger order_lines_protect_reservation before update on public.order_lines
for each row execute function public.protect_reserved_order_line();

create or replace function public.reserve_imported_order(target_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item_row public.inventory_items%rowtype;
  line_row public.order_lines%rowtype;
  reservation_row public.inventory_reservations%rowtype;
  required_units integer;
  reserved_line_count integer := 0;
begin
  select * into order_row from public.orders
  where id = target_order_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Imported order was not found.'; end if;
  if lower(order_row.payment_state) <> 'paid' then raise exception 'Only paid orders can reserve inventory.'; end if;
  if not exists (select 1 from public.order_lines where order_id = order_row.id) then
    raise exception 'The order has no imported lines.';
  end if;
  if exists (
    select 1 from public.order_lines
    where order_id = order_row.id and (match_state <> 'matched' or inventory_item_id is null)
  ) then raise exception 'Every order line must be matched before reserving inventory.'; end if;

  -- Lock all involved inventory rows in stable order before checking the aggregate demand.
  for item_row in
    select item.* from public.inventory_items item
    where item.id in (select inventory_item_id from public.order_lines where order_id = order_row.id)
    order by item.id for update
  loop
    if item_row.verification_state <> 'verified' then
      raise exception 'All matched inventory must be physically verified before reservation.';
    end if;
    select sum(quantity)::integer into required_units from public.order_lines
    where order_id = order_row.id and inventory_item_id = item_row.id and reservation_id is null;
    if coalesce(required_units, 0) > item_row.available then
      raise exception 'Not enough available inventory for item %.', item_row.client_id;
    end if;
  end loop;

  for line_row in
    select * from public.order_lines where order_id = order_row.id order by id for update
  loop
    if line_row.reservation_id is null then
      reservation_row := public.reserve_inventory(
        line_row.inventory_item_id,
        'marketplace_order_line',
        line_row.id::text,
        line_row.quantity,
        'order-line:' || line_row.id::text
      );
      if reservation_row.shortage_quantity > 0 then
        raise exception 'Inventory changed while reserving the order. No reservations were saved.';
      end if;
      update public.order_lines set reservation_id = reservation_row.id where id = line_row.id;
      reserved_line_count := reserved_line_count + 1;
    end if;
  end loop;

  if reserved_line_count > 0 then
    insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
    values (order_row.business_id, order_row.owner_id, 'order.inventory_reserved', order_row.id::text,
      jsonb_build_object('external_order_id', order_row.external_order_id, 'newly_reserved_lines', reserved_line_count));
  end if;
  return reserved_line_count;
end;
$$;

revoke all on function public.reserve_imported_order(uuid) from public;
grant execute on function public.reserve_imported_order(uuid) to authenticated;
