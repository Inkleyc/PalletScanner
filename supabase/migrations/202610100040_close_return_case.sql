-- A return closes only after inventory and financial outcomes are explicit.
alter table public.returns
  add column if not exists inventory_outcome text check (inventory_outcome is null or inventory_outcome in ('dispositioned', 'not_applicable')),
  add column if not exists financial_outcome text check (financial_outcome is null or financial_outcome in ('recorded', 'not_applicable')),
  add column if not exists closure_notes text,
  add column if not exists closed_at timestamptz;

create or replace function public.close_return_case(
  target_return_id uuid,
  inventory_not_applicable boolean,
  financial_not_applicable boolean,
  return_closure_notes text
)
returns public.returns
language plpgsql
security definer
set search_path = public
as $$
declare return_row public.returns%rowtype; open_line_count integer; received_open_count integer; financial_count integer;
begin
  if nullif(trim(return_closure_notes), '') is null then raise exception 'Closure notes are required.'; end if;
  select * into return_row from public.returns where id = target_return_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Return not found.'; end if;
  if return_row.state = 'closed' then return return_row; end if;
  if return_row.state = 'cancelled' then raise exception 'Cancelled returns do not use the completed-return closure workflow.'; end if;
  if return_row.state in ('requested', 'action_required') then raise exception 'Record the confirmed return decision before closure.'; end if;

  select count(*) into open_line_count from public.return_lines
  where return_id = return_row.id and inventory_state in ('unavailable', 'quarantined');
  select count(*) into received_open_count from public.return_lines
  where return_id = return_row.id and inventory_state = 'quarantined';
  if received_open_count > 0 then raise exception 'Received return inventory must be inspected and dispositioned before closure.'; end if;
  if open_line_count > 0 and inventory_not_applicable is not true then raise exception 'Record a final inventory outcome or explicitly confirm that no inventory will return.'; end if;

  select count(*) into financial_count from public.return_financial_events where return_id = return_row.id;
  if financial_count = 0 and financial_not_applicable is not true then raise exception 'Record the financial outcome or explicitly mark it not applicable.'; end if;

  update public.returns set
    state = 'closed', resolved_at = coalesce(resolved_at, now()), closed_at = now(),
    inventory_outcome = case when open_line_count = 0 then 'dispositioned' else 'not_applicable' end,
    financial_outcome = case when financial_count > 0 then 'recorded' else 'not_applicable' end,
    closure_notes = trim(return_closure_notes)
  where id = return_row.id returning * into return_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_row.business_id, return_row.owner_id, 'return.case_closed', return_row.id::text,
    jsonb_build_object('inventory_outcome', return_row.inventory_outcome, 'financial_outcome', return_row.financial_outcome,
      'open_unreceived_lines', open_line_count, 'financial_event_count', financial_count));
  return return_row;
end;
$$;

revoke all on function public.close_return_case(uuid, boolean, boolean, text) from public;
grant execute on function public.close_return_case(uuid, boolean, boolean, text) to authenticated;
