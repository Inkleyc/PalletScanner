-- Manual identity correction for imported order lines. This does not reserve inventory.
create or replace function public.match_order_line(
  target_line_id uuid,
  target_item_id uuid
)
returns public.order_lines
language plpgsql
security invoker
set search_path = public
as $$
declare
  line_row public.order_lines%rowtype;
  item_row public.inventory_items%rowtype;
begin
  select * into line_row from public.order_lines
  where id = target_line_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Imported order line was not found.'; end if;

  select * into item_row from public.inventory_items
  where id = target_item_id and owner_id = auth.uid() and business_id = line_row.business_id;
  if not found then raise exception 'Inventory item was not found in the active business.'; end if;

  update public.order_lines
  set inventory_item_id = item_row.id, match_state = 'matched'
  where id = line_row.id
  returning * into line_row;

  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (
    line_row.business_id,
    line_row.owner_id,
    'order_line.manually_matched',
    line_row.id::text,
    jsonb_build_object(
      'inventory_item_id', item_row.id,
      'inventory_client_id', item_row.client_id,
      'seller_sku', line_row.seller_sku,
      'quantity', line_row.quantity,
      'inventory_reserved', false
    )
  );

  return line_row;
end;
$$;

revoke all on function public.match_order_line(uuid, uuid) from public;
grant execute on function public.match_order_line(uuid, uuid) to authenticated;
