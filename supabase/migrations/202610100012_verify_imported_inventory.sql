create or replace function public.verify_imported_inventory(
  target_item_id uuid,
  counted_quantity integer,
  verification_reason text
)
returns public.inventory_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  item_row public.inventory_items%rowtype;
begin
  if counted_quantity < 0 then raise exception 'Counted quantity cannot be negative.'; end if;
  if nullif(trim(verification_reason), '') is null then raise exception 'A verification reason is required.'; end if;
  select * into item_row from public.inventory_items
  where id = target_item_id and owner_id = auth.uid() for update;
  if not found or item_row.verification_state <> 'unverified_import' then
    raise exception 'Unverified imported inventory was not found.';
  end if;
  if counted_quantity > 0 then
    insert into public.inventory_movements (
      business_id, owner_id, inventory_item_id, quantity, movement_type,
      reason, source_type, source_id, idempotency_key
    ) values (
      item_row.business_id, item_row.owner_id, item_row.id, counted_quantity, 'receipt',
      trim(verification_reason), 'physical_import_verification', item_row.source_observation_id::text,
      'import-verification:' || item_row.id::text
    ) on conflict (business_id, idempotency_key) do nothing;
  end if;
  update public.inventory_items set verification_state = 'verified'
  where id = item_row.id returning * into item_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (item_row.business_id, item_row.owner_id, 'inventory.import_verified', item_row.client_id::text,
    jsonb_build_object('quantity', counted_quantity, 'reason', trim(verification_reason)));
  return item_row;
end;
$$;

revoke all on function public.verify_imported_inventory(uuid, integer, text) from public;
grant execute on function public.verify_imported_inventory(uuid, integer, text) to authenticated;
