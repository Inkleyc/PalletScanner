-- Append-only, idempotent carrier events for manual entry and future marketplace imports.
create or replace function public.record_tracking_event(
  target_shipment_id uuid,
  tracking_event_key text,
  tracking_status text,
  tracking_description text,
  tracking_location text,
  tracking_occurred_at timestamptz
)
returns public.tracking_events
language plpgsql
security invoker
set search_path = public
as $$
declare
  shipment_row public.shipments%rowtype;
  event_row public.tracking_events%rowtype;
begin
  if nullif(trim(tracking_event_key), '') is null then raise exception 'Tracking event key is required.'; end if;
  if tracking_status not in ('label_created', 'accepted', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned') then
    raise exception 'Unsupported tracking status.';
  end if;
  if tracking_occurred_at is null then raise exception 'Tracking event time is required.'; end if;
  select * into shipment_row from public.shipments
  where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment was not found.'; end if;
  if shipment_row.state not in ('label_purchased', 'shipped', 'exception', 'delivered') then
    raise exception 'Shipment is not ready for tracking events.';
  end if;
  select * into event_row from public.tracking_events
  where shipment_id = shipment_row.id and external_event_id = trim(tracking_event_key);
  if found then return event_row; end if;
  insert into public.tracking_events (
    business_id, owner_id, shipment_id, external_event_id, status,
    description, location, occurred_at
  ) values (
    shipment_row.business_id, shipment_row.owner_id, shipment_row.id, trim(tracking_event_key), tracking_status,
    nullif(trim(tracking_description), ''), nullif(trim(tracking_location), ''), tracking_occurred_at
  ) returning * into event_row;
  update public.shipments set
    state = case when tracking_status = 'delivered' then 'delivered' when tracking_status = 'exception' then 'exception' when tracking_status in ('accepted', 'in_transit', 'out_for_delivery') then 'shipped' else state end,
    delivered_at = case when tracking_status = 'delivered' then tracking_occurred_at else delivered_at end,
    last_error = case when tracking_status = 'exception' then coalesce(nullif(trim(tracking_description), ''), 'Carrier reported a shipment exception.') when tracking_status in ('accepted', 'in_transit', 'out_for_delivery', 'delivered') then null else last_error end
  where id = shipment_row.id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, 'shipment.tracking_event_recorded', shipment_row.id::text,
    jsonb_build_object('tracking_event_id', event_row.id, 'status', tracking_status,
      'occurred_at', tracking_occurred_at, 'external_event_id', event_row.external_event_id));
  return event_row;
end;
$$;

revoke all on function public.record_tracking_event(uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.record_tracking_event(uuid, text, text, text, text, timestamptz) to authenticated;
