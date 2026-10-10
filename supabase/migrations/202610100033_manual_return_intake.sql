-- Manual return intake uses the same durable records as future marketplace imports.
create or replace function public.create_manual_return(
  target_order_line_id uuid,
  returned_quantity integer,
  return_reason text,
  client_request_key text
)
returns public.returns
language plpgsql
security invoker
set search_path = public
as $$
declare
  line_row public.order_lines%rowtype;
  order_row public.orders%rowtype;
  return_row public.returns%rowtype;
  external_key text;
begin
  if returned_quantity <= 0 then raise exception 'Return quantity must be greater than zero.'; end if;
  if nullif(trim(return_reason), '') is null or nullif(trim(client_request_key), '') is null then raise exception 'Return reason and request key are required.'; end if;
  select * into line_row from public.order_lines where id = target_order_line_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Order line was not found.'; end if;
  if returned_quantity > line_row.quantity then raise exception 'Return quantity cannot exceed the sold line quantity.'; end if;
  if returned_quantity + coalesce((
    select sum(existing_line.quantity)::integer from public.return_lines existing_line
    join public.returns existing_return on existing_return.id = existing_line.return_id
    where existing_line.order_line_id = line_row.id and existing_return.state <> 'cancelled'
  ), 0) > line_row.quantity then raise exception 'Open and completed returns cannot exceed the sold line quantity.'; end if;
  select * into order_row from public.orders where id = line_row.order_id and business_id = line_row.business_id;
  if not found then raise exception 'Order was not found.'; end if;
  if not exists (select 1 from public.shipments where order_id = order_row.id and state in ('shipped', 'delivered', 'exception')) then
    raise exception 'Only shipped orders can start a return.';
  end if;
  external_key := 'manual:' || trim(client_request_key);
  select * into return_row from public.returns
  where business_id = order_row.business_id and source = 'manual' and external_return_id = external_key;
  if found then return return_row; end if;
  insert into public.returns (
    business_id, owner_id, order_id, source, external_return_id, state,
    requested_resolution, responsibility, reason, external_created_at
  ) values (
    order_row.business_id, order_row.owner_id, order_row.id, 'manual', external_key, 'requested',
    'refund', 'unknown', trim(return_reason), now()
  ) returning * into return_row;
  insert into public.return_lines (
    business_id, owner_id, return_id, order_line_id, external_return_line_id,
    quantity, inventory_item_id, inventory_state
  ) values (
    order_row.business_id, order_row.owner_id, return_row.id, line_row.id,
    external_key || ':line:' || line_row.id::text, returned_quantity, line_row.inventory_item_id, 'unavailable'
  );
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_row.business_id, return_row.owner_id, 'return.manual_created', return_row.id::text,
    jsonb_build_object('order_id', return_row.order_id, 'order_line_id', line_row.id, 'quantity', returned_quantity, 'reason', trim(return_reason)));
  return return_row;
end;
$$;

revoke all on function public.create_manual_return(uuid, integer, text, text) from public;
grant execute on function public.create_manual_return(uuid, integer, text, text) to authenticated;
