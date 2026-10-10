-- Returned inventory is received into quarantine, inspected, then explicitly dispositioned.
alter table public.return_lines drop constraint return_lines_inventory_state_check;
alter table public.return_lines add constraint return_lines_inventory_state_check check (inventory_state in (
  'unavailable', 'quarantined', 'restocked', 'revised', 'repaired', 'parts',
  'supplier_return', 'discarded', 'lost'
));
alter table public.return_lines add column quarantine_reservation_id uuid;
alter table public.return_lines add constraint return_lines_quarantine_reservation_fk
  foreign key (quarantine_reservation_id, business_id)
  references public.inventory_reservations(id, business_id) on delete restrict;

create or replace function public.receive_return_line(target_return_line_id uuid, receipt_note text default null)
returns public.return_lines
language plpgsql
security invoker
set search_path = public
as $$
declare
  line_row public.return_lines%rowtype;
  return_row public.returns%rowtype;
  item_row public.inventory_items%rowtype;
  reservation_row public.inventory_reservations%rowtype;
begin
  select * into line_row from public.return_lines where id = target_return_line_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Return line was not found.'; end if;
  if line_row.inventory_state = 'quarantined' then return line_row; end if;
  if line_row.inventory_state <> 'unavailable' then raise exception 'Return line has already entered inventory processing.'; end if;
  if line_row.inventory_item_id is null then raise exception 'Return line must be matched to inventory before receipt.'; end if;
  select * into return_row from public.returns where id = line_row.return_id and business_id = line_row.business_id for update;
  if return_row.state in ('resolved', 'closed', 'cancelled') then raise exception 'Closed or cancelled returns cannot be received.'; end if;
  select * into item_row from public.inventory_items where id = line_row.inventory_item_id and business_id = line_row.business_id for update;
  if not found then raise exception 'Matched inventory item was not found.'; end if;

  insert into public.inventory_movements (
    business_id, owner_id, inventory_item_id, quantity, movement_type,
    reason, source_type, source_id, idempotency_key
  ) values (
    line_row.business_id, line_row.owner_id, line_row.inventory_item_id, line_row.quantity, 'return_receipt',
    coalesce(nullif(trim(receipt_note), ''), 'Returned inventory received into quarantine'),
    'return_line', line_row.id::text, 'return-receipt:' || line_row.id::text
  ) on conflict (business_id, idempotency_key) do nothing;
  reservation_row := public.reserve_inventory(
    line_row.inventory_item_id, 'return_quarantine', line_row.id::text, line_row.quantity,
    'return-quarantine:' || line_row.id::text
  );
  if reservation_row.reserved_quantity <> line_row.quantity then raise exception 'Returned inventory could not be fully quarantined.'; end if;
  update public.return_lines set inventory_state = 'quarantined', quarantine_reservation_id = reservation_row.id
  where id = line_row.id returning * into line_row;
  update public.returns set state = 'received', received_at = coalesce(received_at, now()) where id = return_row.id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (line_row.business_id, line_row.owner_id, 'return.inventory_received_quarantined', line_row.id::text,
    jsonb_build_object('return_id', line_row.return_id, 'inventory_item_id', line_row.inventory_item_id, 'quantity', line_row.quantity));
  return line_row;
end;
$$;

create or replace function public.inspect_return_line(
  target_return_line_id uuid,
  received_condition text,
  received_completeness text,
  inspection_notes text,
  disposition_recommendation text
)
returns public.return_inspections
language plpgsql
security invoker
set search_path = public
as $$
declare line_row public.return_lines%rowtype; inspection_row public.return_inspections%rowtype;
begin
  if nullif(trim(received_condition), '') is null then raise exception 'Received condition is required.'; end if;
  if disposition_recommendation not in ('restock', 'revise', 'repair', 'parts', 'quarantine', 'supplier_return', 'discard', 'loss') then raise exception 'Choose a supported disposition recommendation.'; end if;
  select * into line_row from public.return_lines where id = target_return_line_id and owner_id = auth.uid() for update;
  if not found or line_row.inventory_state <> 'quarantined' then raise exception 'Return inventory must be received into quarantine before inspection.'; end if;
  insert into public.return_inspections (
    business_id, owner_id, return_line_id, condition_received, completeness, notes, recommended_disposition
  ) values (
    line_row.business_id, line_row.owner_id, line_row.id, trim(received_condition),
    nullif(trim(received_completeness), ''), nullif(trim(inspection_notes), ''), disposition_recommendation
  ) returning * into inspection_row;
  update public.returns set state = 'inspecting' where id = line_row.return_id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (line_row.business_id, line_row.owner_id, 'return.inventory_inspected', line_row.id::text,
    jsonb_build_object('inspection_id', inspection_row.id, 'recommended_disposition', disposition_recommendation));
  return inspection_row;
end;
$$;

create or replace function public.disposition_return_line(target_return_line_id uuid, selected_disposition text, disposition_note text)
returns public.return_lines
language plpgsql
security invoker
set search_path = public
as $$
declare line_row public.return_lines%rowtype; reservation_row public.inventory_reservations%rowtype; movement_kind text;
begin
  if selected_disposition not in ('restock', 'revise', 'repair', 'parts', 'quarantine', 'supplier_return', 'discard', 'loss') then raise exception 'Choose a supported return disposition.'; end if;
  if nullif(trim(disposition_note), '') is null then raise exception 'Disposition note is required.'; end if;
  select * into line_row from public.return_lines where id = target_return_line_id and owner_id = auth.uid() for update;
  if not found or line_row.inventory_state <> 'quarantined' then raise exception 'Only quarantined return inventory can be dispositioned.'; end if;
  if not exists (select 1 from public.return_inspections where return_line_id = line_row.id) then raise exception 'Inspect the return before choosing its disposition.'; end if;
  if selected_disposition = 'quarantine' then return line_row; end if;
  select * into reservation_row from public.inventory_reservations
  where id = line_row.quarantine_reservation_id and owner_id = auth.uid() and state = 'active' for update;
  if not found then raise exception 'Active return quarantine reservation was not found.'; end if;

  if selected_disposition in ('restock', 'revise', 'repair') then
    perform public.release_inventory_reservation(reservation_row.id);
  else
    movement_kind := case when selected_disposition = 'loss' then 'loss' when selected_disposition = 'discard' then 'discard' else 'damage' end;
    insert into public.inventory_movements (
      business_id, owner_id, inventory_item_id, quantity, movement_type,
      reason, source_type, source_id, idempotency_key
    ) values (
      line_row.business_id, line_row.owner_id, line_row.inventory_item_id, -line_row.quantity, movement_kind,
      trim(disposition_note), 'return_disposition', line_row.id::text,
      'return-disposition:' || line_row.id::text || ':' || selected_disposition
    ) on conflict (business_id, idempotency_key) do nothing;
    update public.inventory_reservations set consumed_quantity = reserved_quantity, state = 'consumed'
    where id = reservation_row.id;
  end if;
  update public.return_lines set inventory_state = case selected_disposition
    when 'restock' then 'restocked' when 'revise' then 'revised' when 'repair' then 'repaired'
    when 'parts' then 'parts' when 'supplier_return' then 'supplier_return'
    when 'discard' then 'discarded' when 'loss' then 'lost' end
  where id = line_row.id returning * into line_row;
  if not exists (select 1 from public.return_lines where return_id = line_row.return_id and inventory_state in ('unavailable', 'quarantined')) then
    update public.returns set state = 'resolved', resolved_at = now() where id = line_row.return_id;
  end if;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (line_row.business_id, line_row.owner_id, 'return.inventory_dispositioned', line_row.id::text,
    jsonb_build_object('return_id', line_row.return_id, 'disposition', selected_disposition, 'quantity', line_row.quantity, 'note', trim(disposition_note)));
  return line_row;
end;
$$;

revoke all on function public.receive_return_line(uuid, text) from public;
grant execute on function public.receive_return_line(uuid, text) to authenticated;
revoke all on function public.inspect_return_line(uuid, text, text, text, text) from public;
grant execute on function public.inspect_return_line(uuid, text, text, text, text) to authenticated;
revoke all on function public.disposition_return_line(uuid, text, text) from public;
grant execute on function public.disposition_return_line(uuid, text, text) to authenticated;
