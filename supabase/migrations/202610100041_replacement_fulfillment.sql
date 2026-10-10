-- Replacement shipments reserve and consume inventory independently from the original sale.
alter table public.shipments drop constraint if exists shipments_order_id_key;
alter table public.shipments
  add column if not exists shipment_kind text not null default 'original'
    check (shipment_kind in ('original', 'replacement')),
  add column if not exists return_id uuid,
  add column if not exists replacement_return_line_id uuid,
  add constraint shipments_return_fk foreign key (return_id, business_id) references public.returns(id, business_id) on delete restrict,
  add constraint shipments_replacement_line_fk foreign key (replacement_return_line_id, business_id) references public.return_lines(id, business_id) on delete restrict;
create unique index shipments_one_original_per_order_idx on public.shipments(order_id) where shipment_kind = 'original';
create unique index shipments_one_replacement_per_return_line_idx on public.shipments(replacement_return_line_id) where shipment_kind = 'replacement';

alter table public.inventory_movements drop constraint inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check check (movement_type in (
  'receipt', 'correction', 'sale', 'replacement', 'return_receipt', 'restock', 'damage',
  'loss', 'discard', 'bundle_consumption', 'split', 'merge'
));

create table public.replacement_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null,
  return_line_id uuid not null,
  inventory_item_id uuid not null,
  quantity integer not null check (quantity > 0),
  reservation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (shipment_id, return_line_id),
  unique (id, business_id),
  foreign key (shipment_id, business_id) references public.shipments(id, business_id) on delete cascade,
  foreign key (return_line_id, business_id) references public.return_lines(id, business_id) on delete restrict,
  foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict,
  foreign key (reservation_id, business_id) references public.inventory_reservations(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);
alter table public.replacement_shipment_lines enable row level security;
create policy "owners read replacement shipment lines" on public.replacement_shipment_lines for select using (owner_id = auth.uid());

create or replace function public.protect_replacement_return_closure()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.state = 'closed' and old.state <> 'closed' and new.approved_resolution = 'replacement' then
    if not exists (select 1 from public.shipments where return_id = new.id and shipment_kind = 'replacement') then
      raise exception 'Replacement fulfillment must be created before closing this return.';
    end if;
    if exists (select 1 from public.shipments where return_id = new.id and shipment_kind = 'replacement' and state not in ('shipped', 'delivered')) then
      raise exception 'Every replacement shipment must reach carrier handoff before closing this return.';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_replacement_return_closure before update of state on public.returns
for each row execute function public.protect_replacement_return_closure();

create or replace function public.start_return_replacement(
  target_return_line_id uuid,
  replacement_inventory_item_id uuid,
  replacement_quantity integer,
  target_package_preset_id uuid default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public
as $$
declare
  return_line_row public.return_lines%rowtype; return_row public.returns%rowtype; item_row public.inventory_items%rowtype;
  shipment_row public.shipments%rowtype; package_row public.shipment_packages%rowtype; preset_row public.package_presets%rowtype;
  reservation_row public.inventory_reservations%rowtype;
begin
  if replacement_quantity is null or replacement_quantity < 1 then raise exception 'Replacement quantity must be at least one.'; end if;
  select * into return_line_row from public.return_lines where id = target_return_line_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Return line not found.'; end if;
  select * into return_row from public.returns where id = return_line_row.return_id and business_id = return_line_row.business_id for update;
  if return_row.approved_resolution <> 'replacement' then raise exception 'A confirmed replacement decision is required before fulfillment.'; end if;
  if return_row.state in ('closed', 'cancelled') then raise exception 'Closed or cancelled returns cannot start replacement fulfillment.'; end if;
  if replacement_quantity > return_line_row.quantity then raise exception 'Replacement quantity cannot exceed the approved return quantity.'; end if;
  select * into shipment_row from public.shipments where replacement_return_line_id = return_line_row.id;
  if found then return shipment_row; end if;
  select * into item_row from public.inventory_items where id = replacement_inventory_item_id and business_id = return_row.business_id and owner_id = auth.uid() for update;
  if not found or item_row.archived_at is not null then raise exception 'Replacement inventory item was not found.'; end if;
  if item_row.verification_state <> 'verified' then raise exception 'Replacement inventory must be physically verified.'; end if;
  if target_package_preset_id is not null then
    select * into preset_row from public.package_presets where id = target_package_preset_id and business_id = return_row.business_id and owner_id = auth.uid() and is_active;
    if not found then raise exception 'Active package preset was not found.'; end if;
  end if;
  reservation_row := public.reserve_inventory(item_row.id, 'return_replacement', return_line_row.id::text, replacement_quantity, 'return-replacement:' || return_line_row.id::text);
  if reservation_row.state <> 'active' or reservation_row.reserved_quantity <> replacement_quantity then raise exception 'Replacement inventory could not be fully reserved.'; end if;

  insert into public.shipments (business_id, owner_id, order_id, state, fulfillment_method, shipment_kind, return_id, replacement_return_line_id)
  values (return_row.business_id, return_row.owner_id, return_row.order_id, 'ready_to_pick', 'shipping', 'replacement', return_row.id, return_line_row.id)
  returning * into shipment_row;
  insert into public.replacement_shipment_lines (business_id, owner_id, shipment_id, return_line_id, inventory_item_id, quantity, reservation_id)
  values (return_row.business_id, return_row.owner_id, shipment_row.id, return_line_row.id, item_row.id, replacement_quantity, reservation_row.id);
  insert into public.shipment_packages (
    business_id, owner_id, shipment_id, package_preset_id, package_number, item_weight_grams,
    estimated_weight_grams, length_mm, width_mm, height_mm, measurement_state
  ) values (
    return_row.business_id, return_row.owner_id, shipment_row.id, target_package_preset_id, 1,
    case when item_row.item_weight_grams is not null then item_row.item_weight_grams * replacement_quantity end,
    case when item_row.item_weight_grams is not null then item_row.item_weight_grams * replacement_quantity + coalesce(preset_row.tare_weight_grams, 0) + coalesce(preset_row.packing_allowance_grams, 0) end,
    preset_row.length_mm, preset_row.width_mm, preset_row.height_mm,
    case when item_row.item_weight_grams is null then 'incomplete' else 'estimated' end
  ) returning * into package_row;
  insert into public.shipment_package_lines (business_id, owner_id, shipment_package_id, order_line_id, quantity)
  values (return_row.business_id, return_row.owner_id, package_row.id, return_line_row.order_line_id, replacement_quantity);
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_row.business_id, return_row.owner_id, 'return.replacement_fulfillment_started', shipment_row.id::text,
    jsonb_build_object('return_id', return_row.id, 'return_line_id', return_line_row.id, 'inventory_item_id', item_row.id,
      'quantity', replacement_quantity, 'reservation_id', reservation_row.id));
  return shipment_row;
end;
$$;

create or replace function public.confirm_shipment_shipped(target_shipment_id uuid, carrier_handoff_at timestamptz default now())
returns public.shipments
language plpgsql
security definer
set search_path = public
as $$
declare shipment_row public.shipments%rowtype; line_row public.order_lines%rowtype; replacement_line public.replacement_shipment_lines%rowtype; reservation_row public.inventory_reservations%rowtype;
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
    perform item.id from public.inventory_items item where item.id in (select inventory_item_id from public.order_lines where order_id = shipment_row.order_id) order by item.id for update;
    for line_row in select * from public.order_lines where order_id = shipment_row.order_id order by id for update loop
      select * into reservation_row from public.inventory_reservations where id = line_row.reservation_id and business_id = shipment_row.business_id for update;
      if not found or reservation_row.inventory_item_id <> line_row.inventory_item_id or reservation_row.source_type <> 'marketplace_order_line' or reservation_row.source_id <> line_row.id::text or reservation_row.state <> 'active' or reservation_row.reserved_quantity - reservation_row.consumed_quantity < line_row.quantity then raise exception 'Every shipped order line must have an active reservation with enough quantity.'; end if;
      insert into public.inventory_movements (business_id, owner_id, inventory_item_id, quantity, movement_type, reason, source_type, source_id, idempotency_key, occurred_at)
      values (shipment_row.business_id, shipment_row.owner_id, line_row.inventory_item_id, -line_row.quantity, 'sale', 'Inventory consumed at confirmed carrier handoff', 'shipment_order_line', line_row.id::text, 'shipment-sale:' || shipment_row.id::text || ':' || line_row.id::text, carrier_handoff_at)
      on conflict (business_id, idempotency_key) do nothing;
      update public.inventory_reservations set consumed_quantity = reserved_quantity, shortage_quantity = 0, state = 'consumed' where id = reservation_row.id;
    end loop;
  end if;
  update public.shipments set state = 'shipped', shipped_at = carrier_handoff_at where id = shipment_row.id returning * into shipment_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, case when shipment_row.shipment_kind = 'replacement' then 'return.replacement_carrier_handoff_confirmed' else 'shipment.carrier_handoff_confirmed' end, shipment_row.id::text,
    jsonb_build_object('order_id', shipment_row.order_id, 'return_id', shipment_row.return_id, 'tracking_number', shipment_row.tracking_number, 'carrier', shipment_row.carrier, 'shipped_at', shipment_row.shipped_at));
  return shipment_row;
end;
$$;

create or replace function public.record_shipment_label(
  target_shipment_id uuid, purchased_label_source text, purchased_carrier text,
  purchased_service text, purchased_tracking_number text, purchased_cost numeric
)
returns public.shipments
language plpgsql
security definer
set search_path = public
as $$
declare shipment_row public.shipments%rowtype;
begin
  if purchased_label_source not in ('ebay', 'external') then raise exception 'Label source must be eBay or external.'; end if;
  if nullif(trim(purchased_carrier), '') is null or nullif(trim(purchased_service), '') is null or nullif(trim(purchased_tracking_number), '') is null then raise exception 'Carrier, service, and tracking number are required.'; end if;
  if purchased_cost is null or purchased_cost < 0 then raise exception 'Final label cost must be zero or greater.'; end if;
  select * into shipment_row from public.shipments where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment was not found.'; end if;
  if shipment_row.state = 'label_purchased' and shipment_row.tracking_number = trim(purchased_tracking_number) then return shipment_row; end if;
  if shipment_row.state <> 'ready_for_label' then raise exception 'Final package measurements are required before recording a label.'; end if;
  update public.shipments set state = 'label_purchased', label_source = purchased_label_source,
    carrier = trim(purchased_carrier), service = trim(purchased_service), tracking_number = trim(purchased_tracking_number), final_shipping_cost = purchased_cost
  where id = shipment_row.id returning * into shipment_row;
  if shipment_row.shipment_kind = 'replacement' and purchased_cost > 0 then
    insert into public.return_financial_events (business_id, owner_id, return_id, event_type, amount, currency, external_event_id, occurred_at, details)
    values (shipment_row.business_id, shipment_row.owner_id, shipment_row.return_id, 'replacement_shipping', purchased_cost, 'USD', 'replacement-label:' || shipment_row.id::text, now(),
      jsonb_build_object('shipment_id', shipment_row.id, 'carrier', shipment_row.carrier, 'tracking_number', shipment_row.tracking_number))
    on conflict (return_id, external_event_id) do nothing;
  end if;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, 'shipment.label_recorded', shipment_row.id::text,
    jsonb_build_object('shipment_kind', shipment_row.shipment_kind, 'return_id', shipment_row.return_id, 'source', purchased_label_source,
      'carrier', shipment_row.carrier, 'service', shipment_row.service, 'tracking_number', shipment_row.tracking_number, 'final_shipping_cost', shipment_row.final_shipping_cost));
  return shipment_row;
end;
$$;

revoke all on function public.start_return_replacement(uuid, uuid, integer, uuid) from public;
grant execute on function public.start_return_replacement(uuid, uuid, integer, uuid) to authenticated;
