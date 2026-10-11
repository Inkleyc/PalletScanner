-- Convert original marketplace fulfillment into idempotent realized sales.
alter table public.sales
  add column source text not null default 'manual'
    check (source in ('manual', 'marketplace_fulfillment')),
  add column order_line_id uuid,
  add constraint sales_order_line_fk foreign key (order_line_id, business_id)
    references public.order_lines(id, business_id) on delete restrict,
  add constraint sales_source_order_line_check check (
    (source = 'manual' and order_line_id is null)
    or (source = 'marketplace_fulfillment' and order_line_id is not null)
  );

create unique index sales_one_fulfillment_sale_per_order_line_idx
  on public.sales(order_line_id)
  where order_line_id is not null;

create or replace function public.consume_inventory_for_sale()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_available integer;
begin
  -- Shipment confirmation already owns the inventory movement for imported orders.
  if new.source = 'marketplace_fulfillment' then
    return new;
  end if;

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

create or replace function public.confirm_shipment_shipped(target_shipment_id uuid, carrier_handoff_at timestamptz default now())
returns public.shipments
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_row public.shipments%rowtype;
  order_row public.orders%rowtype;
  line_row public.order_lines%rowtype;
  replacement_line public.replacement_shipment_lines%rowtype;
  reservation_row public.inventory_reservations%rowtype;
  line_revenue numeric;
  eligible_revenue numeric := 0;
  eligible_quantity integer := 0;
  allocated_shipping numeric;
  missing_sale_count integer := 0;
begin
  select * into shipment_row from public.shipments where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment was not found.'; end if;
  if shipment_row.state = 'shipped' then return shipment_row; end if;
  if shipment_row.state <> 'label_purchased' or shipment_row.tracking_number is null then raise exception 'A recorded shipping label with tracking is required before carrier handoff.'; end if;

  if shipment_row.shipment_kind = 'replacement' then
    perform item.id from public.inventory_items item where item.id in (select inventory_item_id from public.replacement_shipment_lines where shipment_id = shipment_row.id) order by item.id for update;
    for replacement_line in select * from public.replacement_shipment_lines where shipment_id = shipment_row.id order by id for update loop
      select * into reservation_row from public.inventory_reservations where id = replacement_line.reservation_id and business_id = shipment_row.business_id for update;
      if not found or reservation_row.inventory_item_id <> replacement_line.inventory_item_id or reservation_row.source_type <> 'return_replacement' or reservation_row.source_id <> replacement_line.return_line_id::text or reservation_row.state <> 'active' or reservation_row.reserved_quantity - reservation_row.consumed_quantity < replacement_line.quantity then raise exception 'Every replacement line must have its own active reservation with enough quantity.'; end if;
      insert into public.inventory_movements (business_id, owner_id, inventory_item_id, quantity, movement_type, reason, source_type, source_id, idempotency_key, occurred_at)
      values (shipment_row.business_id, shipment_row.owner_id, replacement_line.inventory_item_id, -replacement_line.quantity, 'replacement', 'Replacement inventory consumed at confirmed carrier handoff', 'replacement_shipment_line', replacement_line.id::text, 'replacement-shipment:' || shipment_row.id::text || ':' || replacement_line.id::text, carrier_handoff_at)
      on conflict (business_id, idempotency_key) do nothing;
      update public.inventory_reservations set consumed_quantity = reserved_quantity, shortage_quantity = 0, state = 'consumed' where id = reservation_row.id;
    end loop;
  else
    select * into order_row from public.orders where id = shipment_row.order_id and business_id = shipment_row.business_id;
    if not found then raise exception 'Shipment order was not found.'; end if;

    select
      coalesce(sum(case when coalesce(line_cost->>'value', line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then coalesce(line_cost->>'value', line_cost->>'amount')::numeric else 0 end), 0),
      coalesce(sum(case when coalesce(line_cost->>'value', line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then quantity else 0 end), 0)
    into eligible_revenue, eligible_quantity
    from public.order_lines
    where order_id = shipment_row.order_id;

    perform item.id from public.inventory_items item where item.id in (select inventory_item_id from public.order_lines where order_id = shipment_row.order_id) order by item.id for update;
    for line_row in select * from public.order_lines where order_id = shipment_row.order_id order by id for update loop
      select * into reservation_row from public.inventory_reservations where id = line_row.reservation_id and business_id = shipment_row.business_id for update;
      if not found or reservation_row.inventory_item_id <> line_row.inventory_item_id or reservation_row.source_type <> 'marketplace_order_line' or reservation_row.source_id <> line_row.id::text or reservation_row.state <> 'active' or reservation_row.reserved_quantity - reservation_row.consumed_quantity < line_row.quantity then raise exception 'Every shipped order line must have an active reservation with enough quantity.'; end if;
      insert into public.inventory_movements (business_id, owner_id, inventory_item_id, quantity, movement_type, reason, source_type, source_id, idempotency_key, occurred_at)
      values (shipment_row.business_id, shipment_row.owner_id, line_row.inventory_item_id, -line_row.quantity, 'sale', 'Inventory consumed at confirmed carrier handoff', 'shipment_order_line', line_row.id::text, 'shipment-sale:' || shipment_row.id::text || ':' || line_row.id::text, carrier_handoff_at)
      on conflict (business_id, idempotency_key) do nothing;
      update public.inventory_reservations set consumed_quantity = reserved_quantity, shortage_quantity = 0, state = 'consumed' where id = reservation_row.id;

      if coalesce(line_row.line_cost->>'value', line_row.line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then
        line_revenue := coalesce(line_row.line_cost->>'value', line_row.line_cost->>'amount')::numeric;
        allocated_shipping := case
          when coalesce(shipment_row.final_shipping_cost, 0) = 0 then 0
          when eligible_revenue > 0 then round(shipment_row.final_shipping_cost * line_revenue / eligible_revenue, 2)
          when eligible_quantity > 0 then round(shipment_row.final_shipping_cost * line_row.quantity::numeric / eligible_quantity, 2)
          else 0
        end;
        insert into public.sales (business_id, owner_id, item_id, marketplace, sold_price, fees, shipping_cost, sold_at, quantity, source, order_line_id)
        values (shipment_row.business_id, shipment_row.owner_id, line_row.inventory_item_id,
          case when order_row.source = 'ebay' then 'ebay' else 'other' end,
          line_revenue, 0, allocated_shipping, carrier_handoff_at, line_row.quantity, 'marketplace_fulfillment', line_row.id)
        on conflict (order_line_id) where order_line_id is not null do nothing;
      else
        missing_sale_count := missing_sale_count + 1;
      end if;
    end loop;
  end if;

  update public.shipments set state = 'shipped', shipped_at = carrier_handoff_at where id = shipment_row.id returning * into shipment_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, case when shipment_row.shipment_kind = 'replacement' then 'return.replacement_carrier_handoff_confirmed' else 'shipment.carrier_handoff_confirmed' end, shipment_row.id::text,
    jsonb_build_object('order_id', shipment_row.order_id, 'return_id', shipment_row.return_id, 'tracking_number', shipment_row.tracking_number, 'carrier', shipment_row.carrier, 'shipped_at', shipment_row.shipped_at, 'unrecorded_sale_lines', missing_sale_count));
  if missing_sale_count > 0 then
    insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
    values (shipment_row.business_id, shipment_row.owner_id, 'shipment.sale_recording_incomplete', shipment_row.id::text,
      jsonb_build_object('order_id', shipment_row.order_id, 'missing_line_count', missing_sale_count, 'reason', 'Marketplace line revenue was missing or invalid'));
  end if;
  return shipment_row;
end;
$$;

