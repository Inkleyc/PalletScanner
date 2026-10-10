-- Record the result of an external/eBay label purchase without claiming PalletFlip bought it.
create or replace function public.record_shipment_label(
  target_shipment_id uuid,
  purchased_label_source text,
  purchased_carrier text,
  purchased_service text,
  purchased_tracking_number text,
  purchased_cost numeric
)
returns public.shipments
language plpgsql
security invoker
set search_path = public
as $$
declare shipment_row public.shipments%rowtype;
begin
  if purchased_label_source not in ('ebay', 'external') then raise exception 'Label source must be eBay or external.'; end if;
  if nullif(trim(purchased_carrier), '') is null or nullif(trim(purchased_service), '') is null or nullif(trim(purchased_tracking_number), '') is null then
    raise exception 'Carrier, service, and tracking number are required.';
  end if;
  if purchased_cost is null or purchased_cost < 0 then raise exception 'Final label cost must be zero or greater.'; end if;
  select * into shipment_row from public.shipments
  where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment was not found.'; end if;
  if shipment_row.state = 'label_purchased' and shipment_row.tracking_number = trim(purchased_tracking_number) then return shipment_row; end if;
  if shipment_row.state <> 'ready_for_label' then raise exception 'Final package measurements are required before recording a label.'; end if;
  update public.shipments set
    state = 'label_purchased', label_source = purchased_label_source,
    carrier = trim(purchased_carrier), service = trim(purchased_service),
    tracking_number = trim(purchased_tracking_number), final_shipping_cost = purchased_cost
  where id = shipment_row.id returning * into shipment_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, 'shipment.label_recorded', shipment_row.id::text,
    jsonb_build_object('source', purchased_label_source, 'carrier', shipment_row.carrier,
      'service', shipment_row.service, 'tracking_number', shipment_row.tracking_number,
      'final_shipping_cost', shipment_row.final_shipping_cost));
  return shipment_row;
end;
$$;

revoke all on function public.record_shipment_label(uuid, text, text, text, text, numeric) from public;
grant execute on function public.record_shipment_label(uuid, text, text, text, text, numeric) to authenticated;
