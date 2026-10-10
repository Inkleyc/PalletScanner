-- Explicitly start fulfillment only after a paid order has complete active reservations.
create or replace function public.start_order_fulfillment(target_order_id uuid, target_package_preset_id uuid default null)
returns public.shipments
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  shipment_row public.shipments%rowtype;
  package_row public.shipment_packages%rowtype;
  preset_row public.package_presets%rowtype;
  line_row public.order_lines%rowtype;
  item_weight_total integer;
  weighted_line_count integer;
  total_line_count integer;
begin
  select * into order_row from public.orders
  where id = target_order_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Order was not found.'; end if;

  select * into shipment_row from public.shipments
  where order_id = order_row.id and owner_id = auth.uid();
  if found then return shipment_row; end if;

  if lower(order_row.payment_state) <> 'paid' then
    raise exception 'Only paid orders can enter fulfillment.';
  end if;
  if coalesce(lower(order_row.cancellation_state), 'none_requested') <> 'none_requested' then
    raise exception 'Cancelled orders cannot enter fulfillment.';
  end if;
  if not exists (select 1 from public.order_lines where order_id = order_row.id) then
    raise exception 'The order has no lines to fulfill.';
  end if;
  if exists (
    select 1 from public.order_lines line
    left join public.inventory_reservations reservation on reservation.id = line.reservation_id
    where line.order_id = order_row.id
      and (line.reservation_id is null or reservation.state <> 'active' or reservation.reserved_quantity < line.quantity)
  ) then raise exception 'Every order line must have an active inventory reservation before fulfillment.'; end if;

  if target_package_preset_id is not null then
    select * into preset_row from public.package_presets
    where id = target_package_preset_id and business_id = order_row.business_id and owner_id = auth.uid() and is_active;
    if not found then raise exception 'Active package preset was not found.'; end if;
  end if;

  insert into public.shipments (
    business_id, owner_id, order_id, state, fulfillment_method, ship_by_at
  ) values (
    order_row.business_id, order_row.owner_id, order_row.id,
    case when order_row.fulfillment_method = 'local_pickup' then 'pickup_ready' else 'ready_to_pick' end,
    order_row.fulfillment_method, order_row.ship_by_at
  ) returning * into shipment_row;

  if order_row.fulfillment_method = 'shipping' then
    select count(*), count(item.item_weight_grams), sum(item.item_weight_grams * line.quantity)::integer
    into total_line_count, weighted_line_count, item_weight_total
    from public.order_lines line
    join public.inventory_items item on item.id = line.inventory_item_id and item.business_id = line.business_id
    where line.order_id = order_row.id;

    insert into public.shipment_packages (
      business_id, owner_id, shipment_id, package_preset_id, package_number,
      item_weight_grams, estimated_weight_grams, length_mm, width_mm, height_mm, measurement_state
    ) values (
      order_row.business_id, order_row.owner_id, shipment_row.id, target_package_preset_id, 1,
      case when weighted_line_count = total_line_count then item_weight_total else null end,
      case when weighted_line_count = total_line_count then item_weight_total + coalesce(preset_row.tare_weight_grams, 0) + coalesce(preset_row.packing_allowance_grams, 0) else null end,
      preset_row.length_mm, preset_row.width_mm, preset_row.height_mm,
      case when weighted_line_count = total_line_count then 'estimated' else 'incomplete' end
    ) returning * into package_row;

    for line_row in select * from public.order_lines where order_id = order_row.id order by id
    loop
      insert into public.shipment_package_lines (
        business_id, owner_id, shipment_package_id, order_line_id, quantity
      ) values (
        order_row.business_id, order_row.owner_id, package_row.id, line_row.id, line_row.quantity
      );
    end loop;
  end if;

  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (order_row.business_id, order_row.owner_id, 'shipment.fulfillment_started', shipment_row.id::text,
    jsonb_build_object(
      'order_id', order_row.id,
      'external_order_id', order_row.external_order_id,
      'fulfillment_method', order_row.fulfillment_method,
      'measurement_state', case when package_row.id is null then null else package_row.measurement_state end
    ));
  return shipment_row;
end;
$$;

revoke all on function public.start_order_fulfillment(uuid, uuid) from public;
grant execute on function public.start_order_fulfillment(uuid, uuid) to authenticated;
