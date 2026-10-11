-- Manual sales become paid orders with reserved inventory; handoff records the realized sale.
create or replace function public.create_manual_sale_order(
  target_item_id uuid, sold_quantity integer, sale_marketplace text, total_sold_price numeric,
  expected_fees numeric, selected_fulfillment_method text, client_request_key text
)
returns public.orders language plpgsql security definer set search_path = public as $$
declare item_row public.inventory_items%rowtype; order_row public.orders%rowtype; line_row public.order_lines%rowtype; reservation_row public.inventory_reservations%rowtype; external_key text;
begin
  if sold_quantity is null or sold_quantity < 1 then raise exception 'Sale quantity must be at least one.'; end if;
  if sale_marketplace not in ('facebook', 'ebay', 'other') then raise exception 'Choose a supported sale marketplace.'; end if;
  if selected_fulfillment_method not in ('shipping', 'local_pickup') then raise exception 'Choose shipping or local pickup.'; end if;
  if total_sold_price is null or total_sold_price < 0 or expected_fees is null or expected_fees < 0 then raise exception 'Sale price and fees must be zero or greater.'; end if;
  if nullif(trim(client_request_key), '') is null then raise exception 'A stable request key is required.'; end if;
  external_key := 'manual:' || trim(client_request_key);
  select * into order_row from public.orders where owner_id = auth.uid() and source = 'manual' and external_order_id = external_key;
  if found then return order_row; end if;
  select * into item_row from public.inventory_items where id = target_item_id and owner_id = auth.uid() for update;
  if not found or item_row.archived_at is not null then raise exception 'Inventory item was not found.'; end if;
  if item_row.verification_state <> 'verified' then raise exception 'Inventory must be physically verified before a manual sale.'; end if;
  if sold_quantity > item_row.available then raise exception 'Sale quantity exceeds available inventory.'; end if;
  insert into public.orders (business_id, owner_id, source, external_order_id, payment_state, fulfillment_state, cancellation_state, currency, fulfillment_method, pricing_summary, raw_payload, external_created_at)
  values (item_row.business_id, item_row.owner_id, 'manual', external_key, 'paid', 'not_started', 'none_requested', 'USD', selected_fulfillment_method,
    jsonb_build_object('priceSubtotal', jsonb_build_object('value', total_sold_price, 'currency', 'USD'), 'sellerFees', jsonb_build_object('value', expected_fees, 'currency', 'USD')),
    jsonb_build_object('marketplace', sale_marketplace), now()) returning * into order_row;
  insert into public.order_lines (business_id, owner_id, order_id, external_line_id, seller_sku, title, quantity, inventory_item_id, match_state, line_cost)
  values (item_row.business_id, item_row.owner_id, order_row.id, 'manual-line-1', item_row.client_id, item_row.name, sold_quantity, item_row.id, 'matched',
    jsonb_build_object('value', total_sold_price, 'currency', 'USD')) returning * into line_row;
  reservation_row := public.reserve_inventory(item_row.id, 'marketplace_order_line', line_row.id::text, sold_quantity, 'manual-order:' || order_row.id::text || ':' || line_row.id::text);
  if reservation_row.state <> 'active' or reservation_row.reserved_quantity <> sold_quantity then raise exception 'Manual sale inventory could not be fully reserved.'; end if;
  update public.order_lines set reservation_id = reservation_row.id where id = line_row.id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (item_row.business_id, item_row.owner_id, 'order.manual_sale_created', order_row.id::text,
    jsonb_build_object('inventory_item_id', item_row.id, 'quantity', sold_quantity, 'marketplace', sale_marketplace, 'fulfillment_method', selected_fulfillment_method, 'reservation_id', reservation_row.id));
  return order_row;
end;
$$;

revoke all on function public.create_manual_sale_order(uuid, integer, text, numeric, numeric, text, text) from public;
grant execute on function public.create_manual_sale_order(uuid, integer, text, numeric, numeric, text, text) to authenticated;
