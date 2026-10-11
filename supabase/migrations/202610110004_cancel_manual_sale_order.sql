-- Cancel a manual sale before handoff and release every remaining reservation atomically.
create or replace function public.cancel_manual_sale_order(target_order_id uuid, cancellation_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare order_row public.orders%rowtype; shipment_row public.shipments%rowtype; line_row public.order_lines%rowtype; released_count integer := 0;
begin
  if nullif(trim(cancellation_reason), '') is null then raise exception 'A cancellation reason is required.'; end if;
  select * into order_row from public.orders where id = target_order_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Manual order was not found.'; end if;
  if order_row.source <> 'manual' then raise exception 'Only manual orders can use manual cancellation.'; end if;
  if lower(order_row.cancellation_state) = 'canceled' then return 0; end if;
  select * into shipment_row from public.shipments where order_id = order_row.id and shipment_kind = 'original' for update;
  if found and shipment_row.state in ('shipped', 'delivered', 'picked_up') then raise exception 'Completed handoff cannot be cancelled; use the return workflow.'; end if;
  for line_row in select * from public.order_lines where order_id = order_row.id order by id for update loop
    if line_row.reservation_id is not null and exists (select 1 from public.inventory_reservations where id = line_row.reservation_id and state in ('active', 'shortage')) then
      perform public.release_inventory_reservation(line_row.reservation_id);
      released_count := released_count + 1;
    end if;
  end loop;
  update public.orders set cancellation_state = 'canceled', fulfillment_state = 'canceled' where id = order_row.id;
  if shipment_row.id is not null then update public.shipments set state = 'cancelled' where id = shipment_row.id; end if;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (order_row.business_id, order_row.owner_id, 'order.manual_sale_cancelled', order_row.id::text,
    jsonb_build_object('reason', trim(cancellation_reason), 'released_lines', released_count, 'shipment_id', shipment_row.id));
  return released_count;
end;
$$;

revoke all on function public.cancel_manual_sale_order(uuid, text) from public;
grant execute on function public.cancel_manual_sale_order(uuid, text) to authenticated;
