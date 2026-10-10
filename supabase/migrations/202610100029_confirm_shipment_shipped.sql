-- Confirm carrier handoff and atomically consume each order-line reservation once.
create or replace function public.confirm_shipment_shipped(target_shipment_id uuid, carrier_handoff_at timestamptz default now())
returns public.shipments
language plpgsql
security invoker
set search_path = public
as $$
declare
  shipment_row public.shipments%rowtype;
  line_row public.order_lines%rowtype;
  reservation_row public.inventory_reservations%rowtype;
begin
  select * into shipment_row from public.shipments
  where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment was not found.'; end if;
  if shipment_row.state = 'shipped' then return shipment_row; end if;
  if shipment_row.state <> 'label_purchased' then raise exception 'A recorded shipping label is required before carrier handoff.'; end if;
  if shipment_row.tracking_number is null then raise exception 'Tracking is required before carrier handoff.'; end if;

  perform item.id from public.inventory_items item
  where item.id in (select inventory_item_id from public.order_lines where order_id = shipment_row.order_id)
  order by item.id for update;

  for line_row in select * from public.order_lines where order_id = shipment_row.order_id order by id for update
  loop
    select * into reservation_row from public.inventory_reservations
    where id = line_row.reservation_id and business_id = shipment_row.business_id for update;
    if not found
      or reservation_row.inventory_item_id <> line_row.inventory_item_id
      or reservation_row.source_type <> 'marketplace_order_line'
      or reservation_row.source_id <> line_row.id::text
      or reservation_row.state <> 'active'
      or reservation_row.reserved_quantity - reservation_row.consumed_quantity < line_row.quantity then
      raise exception 'Every shipped order line must have an active reservation with enough quantity.';
    end if;
    insert into public.inventory_movements (
      business_id, owner_id, inventory_item_id, quantity, movement_type,
      reason, source_type, source_id, idempotency_key, occurred_at
    ) values (
      shipment_row.business_id, shipment_row.owner_id, line_row.inventory_item_id, -line_row.quantity, 'sale',
      'Inventory consumed at confirmed carrier handoff', 'shipment_order_line', line_row.id::text,
      'shipment-sale:' || shipment_row.id::text || ':' || line_row.id::text, carrier_handoff_at
    ) on conflict (business_id, idempotency_key) do nothing;
    update public.inventory_reservations set
      consumed_quantity = reserved_quantity,
      shortage_quantity = 0,
      state = 'consumed'
    where id = reservation_row.id;
  end loop;

  update public.shipments set state = 'shipped', shipped_at = carrier_handoff_at
  where id = shipment_row.id returning * into shipment_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, 'shipment.carrier_handoff_confirmed', shipment_row.id::text,
    jsonb_build_object('order_id', shipment_row.order_id, 'tracking_number', shipment_row.tracking_number,
      'carrier', shipment_row.carrier, 'shipped_at', shipment_row.shipped_at));
  return shipment_row;
end;
$$;

revoke all on function public.confirm_shipment_shipped(uuid, timestamptz) from public;
grant execute on function public.confirm_shipment_shipped(uuid, timestamptz) to authenticated;
