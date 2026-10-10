-- Guarded pick and pack confirmation. Estimates can never silently become final measurements.
create or replace function public.confirm_shipment_picked(target_shipment_id uuid)
returns public.shipments
language plpgsql
security invoker
set search_path = public
as $$
declare shipment_row public.shipments%rowtype;
begin
  select * into shipment_row from public.shipments
  where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment was not found.'; end if;
  if shipment_row.fulfillment_method <> 'shipping' then raise exception 'Only shipping fulfillment uses the pick and pack workflow.'; end if;
  if shipment_row.state = 'ready_to_pack' then return shipment_row; end if;
  if shipment_row.state <> 'ready_to_pick' then raise exception 'Shipment is not ready for pick confirmation.'; end if;
  update public.shipments set state = 'ready_to_pack'
  where id = shipment_row.id returning * into shipment_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, 'shipment.pick_confirmed', shipment_row.id::text,
    jsonb_build_object('order_id', shipment_row.order_id));
  return shipment_row;
end;
$$;

create or replace function public.confirm_shipment_package(
  target_package_id uuid,
  confirmed_weight_grams integer,
  confirmed_length_mm integer,
  confirmed_width_mm integer,
  confirmed_height_mm integer
)
returns public.shipment_packages
language plpgsql
security invoker
set search_path = public
as $$
declare
  package_row public.shipment_packages%rowtype;
  shipment_row public.shipments%rowtype;
begin
  if confirmed_weight_grams <= 0 or confirmed_length_mm <= 0 or confirmed_width_mm <= 0 or confirmed_height_mm <= 0 then
    raise exception 'Final weight and all dimensions must be greater than zero.';
  end if;
  select * into package_row from public.shipment_packages
  where id = target_package_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment package was not found.'; end if;
  select * into shipment_row from public.shipments
  where id = package_row.shipment_id and business_id = package_row.business_id for update;
  if shipment_row.state not in ('ready_to_pack', 'ready_for_label') then
    raise exception 'Confirm the pick before final package measurements.';
  end if;
  update public.shipment_packages set
    final_weight_grams = confirmed_weight_grams,
    length_mm = confirmed_length_mm,
    width_mm = confirmed_width_mm,
    height_mm = confirmed_height_mm,
    measurement_state = 'confirmed'
  where id = package_row.id returning * into package_row;
  if not exists (
    select 1 from public.shipment_packages
    where shipment_id = shipment_row.id and measurement_state <> 'confirmed'
  ) then update public.shipments set state = 'ready_for_label' where id = shipment_row.id; end if;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (package_row.business_id, package_row.owner_id, 'shipment.package_confirmed', package_row.id::text,
    jsonb_build_object('shipment_id', package_row.shipment_id, 'weight_grams', confirmed_weight_grams,
      'length_mm', confirmed_length_mm, 'width_mm', confirmed_width_mm, 'height_mm', confirmed_height_mm));
  return package_row;
end;
$$;

revoke all on function public.confirm_shipment_picked(uuid) from public;
grant execute on function public.confirm_shipment_picked(uuid) to authenticated;
revoke all on function public.confirm_shipment_package(uuid, integer, integer, integer, integer) from public;
grant execute on function public.confirm_shipment_package(uuid, integer, integer, integer, integer) to authenticated;
