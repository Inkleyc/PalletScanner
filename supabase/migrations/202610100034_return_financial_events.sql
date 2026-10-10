-- Append return-related money events without changing or erasing the original sale.
create or replace function public.record_return_financial_event(
  target_return_id uuid,
  financial_event_type text,
  financial_amount numeric,
  financial_currency text,
  financial_event_key text,
  financial_note text,
  financial_occurred_at timestamptz default now()
)
returns public.return_financial_events
language plpgsql
security invoker
set search_path = public
as $$
declare return_row public.returns%rowtype; event_row public.return_financial_events%rowtype;
begin
  if financial_event_type not in ('refund', 'partial_refund', 'fee_credit', 'return_shipping', 'replacement_shipping', 'other') then raise exception 'Choose a supported return financial event.'; end if;
  if financial_amount is null or financial_amount < 0 then raise exception 'Financial amount must be zero or greater.'; end if;
  if length(trim(financial_currency)) <> 3 or nullif(trim(financial_event_key), '') is null then raise exception 'Currency and event key are required.'; end if;
  select * into return_row from public.returns where id = target_return_id and owner_id = auth.uid();
  if not found then raise exception 'Return was not found.'; end if;
  select * into event_row from public.return_financial_events
  where return_id = return_row.id and external_event_id = trim(financial_event_key);
  if found then return event_row; end if;
  insert into public.return_financial_events (
    business_id, owner_id, return_id, event_type, amount, currency,
    external_event_id, occurred_at, details
  ) values (
    return_row.business_id, return_row.owner_id, return_row.id, financial_event_type,
    financial_amount, upper(trim(financial_currency)), trim(financial_event_key), financial_occurred_at,
    jsonb_build_object('note', nullif(trim(financial_note), ''))
  ) returning * into event_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_row.business_id, return_row.owner_id, 'return.financial_event_recorded', return_row.id::text,
    jsonb_build_object('return_financial_event_id', event_row.id, 'type', event_row.event_type,
      'amount', event_row.amount, 'currency', event_row.currency));
  return event_row;
end;
$$;

revoke all on function public.record_return_financial_event(uuid, text, numeric, text, text, text, timestamptz) from public;
grant execute on function public.record_return_financial_event(uuid, text, numeric, text, text, text, timestamptz) to authenticated;
