-- Repair missing financial rows for an already-shipped original order without moving inventory again.
create or replace function public.reconcile_shipped_fulfillment_sales(target_shipment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare shipment_row public.shipments%rowtype; order_row public.orders%rowtype; line_row public.order_lines%rowtype;
  line_revenue numeric; eligible_revenue numeric := 0; eligible_quantity integer := 0; allocated_shipping numeric; created_count integer := 0; missing_count integer := 0; created_sale_id uuid;
begin
  select * into shipment_row from public.shipments where id = target_shipment_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment was not found.'; end if;
  if shipment_row.shipment_kind <> 'original' then raise exception 'Replacement shipments do not create sales.'; end if;
  if shipment_row.state not in ('shipped', 'delivered') then raise exception 'Only shipped or delivered orders can reconcile sales.'; end if;
  select * into order_row from public.orders where id = shipment_row.order_id and business_id = shipment_row.business_id;
  select coalesce(sum(case when coalesce(line_cost->>'value', line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then coalesce(line_cost->>'value', line_cost->>'amount')::numeric else 0 end), 0),
    coalesce(sum(case when coalesce(line_cost->>'value', line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then quantity else 0 end), 0)
  into eligible_revenue, eligible_quantity from public.order_lines where order_id = shipment_row.order_id;
  for line_row in select * from public.order_lines where order_id = shipment_row.order_id order by id for update loop
    if exists (select 1 from public.sales where order_line_id = line_row.id) then continue; end if;
    if coalesce(line_row.line_cost->>'value', line_row.line_cost->>'amount', '') !~ '^[0-9]+([.][0-9]+)?$' then missing_count := missing_count + 1; continue; end if;
    line_revenue := coalesce(line_row.line_cost->>'value', line_row.line_cost->>'amount')::numeric;
    allocated_shipping := case when coalesce(shipment_row.final_shipping_cost, 0) = 0 then 0
      when eligible_revenue > 0 then round(shipment_row.final_shipping_cost * line_revenue / eligible_revenue, 2)
      when eligible_quantity > 0 then round(shipment_row.final_shipping_cost * line_row.quantity::numeric / eligible_quantity, 2) else 0 end;
    insert into public.sales (business_id, owner_id, item_id, marketplace, sold_price, fees, shipping_cost, sold_at, quantity, source, order_line_id)
    values (shipment_row.business_id, shipment_row.owner_id, line_row.inventory_item_id, case when order_row.source = 'ebay' then 'ebay' else 'other' end,
      line_revenue, 0, allocated_shipping, coalesce(shipment_row.shipped_at, now()), line_row.quantity, 'marketplace_fulfillment', line_row.id)
    on conflict (order_line_id) where order_line_id is not null do nothing returning id into created_sale_id;
    if created_sale_id is not null then
      update public.sales set listing_price_at_sale = null, price_snapshot_source = 'legacy_unknown' where id = created_sale_id;
      created_count := created_count + 1;
    end if;
  end loop;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (shipment_row.business_id, shipment_row.owner_id, 'shipment.sales_reconciled', shipment_row.id::text,
    jsonb_build_object('order_id', shipment_row.order_id, 'created_sale_count', created_count, 'missing_revenue_count', missing_count, 'inventory_changed', false));
  return jsonb_build_object('created_sale_count', created_count, 'missing_revenue_count', missing_count);
end;
$$;

revoke all on function public.reconcile_shipped_fulfillment_sales(uuid) from public;
grant execute on function public.reconcile_shipped_fulfillment_sales(uuid) to authenticated;
