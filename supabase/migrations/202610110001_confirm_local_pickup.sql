-- Local pickup consumes reserved inventory only when the seller confirms buyer handoff.
create or replace function public.confirm_local_pickup_handoff(target_shipment_id uuid, handoff_at timestamptz default now())
returns public.shipments language plpgsql security definer set search_path = public as $$
declare shipment_row public.shipments%rowtype; order_row public.orders%rowtype; line_row public.order_lines%rowtype;
  reservation_row public.inventory_reservations%rowtype; line_revenue numeric; missing_sale_count integer := 0;
begin
  select * into shipment_row from public.shipments where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Pickup fulfillment was not found.'; end if;
  if shipment_row.state = 'picked_up' then return shipment_row; end if;
  if shipment_row.shipment_kind <> 'original' or shipment_row.fulfillment_method <> 'local_pickup' then raise exception 'Only original local-pickup fulfillment can confirm buyer handoff.'; end if;
  if shipment_row.state <> 'pickup_ready' then raise exception 'Pickup must be ready before confirming buyer handoff.'; end if;
  select * into order_row from public.orders where id = shipment_row.order_id and business_id = shipment_row.business_id;
  perform item.id from public.inventory_items item where item.id in (select inventory_item_id from public.order_lines where order_id = shipment_row.order_id) order by item.id for update;
  for line_row in select * from public.order_lines where order_id = shipment_row.order_id order by id for update loop
    select * into reservation_row from public.inventory_reservations where id = line_row.reservation_id and business_id = shipment_row.business_id for update;
    if not found or reservation_row.inventory_item_id <> line_row.inventory_item_id or reservation_row.state <> 'active' or reservation_row.reserved_quantity - reservation_row.consumed_quantity < line_row.quantity then raise exception 'Every pickup line must retain enough active reserved inventory.'; end if;
    insert into public.inventory_movements (business_id, owner_id, inventory_item_id, quantity, movement_type, reason, source_type, source_id, idempotency_key, occurred_at)
    values (shipment_row.business_id, shipment_row.owner_id, line_row.inventory_item_id, -line_row.quantity, 'sale', 'Inventory consumed at confirmed local pickup handoff', 'pickup_order_line', line_row.id::text, 'pickup-sale:' || shipment_row.id::text || ':' || line_row.id::text, handoff_at)
    on conflict (business_id, idempotency_key) do nothing;
    update public.inventory_reservations set consumed_quantity = reserved_quantity, shortage_quantity = 0, state = 'consumed' where id = reservation_row.id;
    if coalesce(line_row.line_cost->>'value', line_row.line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then
      line_revenue := coalesce(line_row.line_cost->>'value', line_row.line_cost->>'amount')::numeric;
      insert into public.sales (business_id, owner_id, item_id, marketplace, sold_price, fees, shipping_cost, sold_at, quantity, source, order_line_id)
      values (shipment_row.business_id, shipment_row.owner_id, line_row.inventory_item_id, case when order_row.source = 'ebay' then 'ebay' else 'other' end,
        line_revenue, 0, 0, handoff_at, line_row.quantity, 'marketplace_fulfillment', line_row.id)
      on conflict (order_line_id) where order_line_id is not null do nothing;
    else missing_sale_count := missing_sale_count + 1;
    end if;
  end loop;
  update public.shipments set state = 'picked_up', pickup_handoff_at = handoff_at where id = shipment_row.id returning * into shipment_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, 'shipment.local_pickup_handoff_confirmed', shipment_row.id::text,
    jsonb_build_object('order_id', shipment_row.order_id, 'pickup_handoff_at', shipment_row.pickup_handoff_at, 'unrecorded_sale_lines', missing_sale_count));
  return shipment_row;
end;
$$;

revoke all on function public.confirm_local_pickup_handoff(uuid, timestamptz) from public;
grant execute on function public.confirm_local_pickup_handoff(uuid, timestamptz) to authenticated;
