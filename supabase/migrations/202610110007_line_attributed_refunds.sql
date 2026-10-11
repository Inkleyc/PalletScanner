-- Attribute reviewed refunds to a returned order line and quantity.
alter table public.return_financial_events
  add column return_line_id uuid,
  add column refunded_quantity integer check (refunded_quantity is null or refunded_quantity > 0),
  add constraint return_financial_events_return_line_fk
    foreign key (return_line_id, business_id)
    references public.return_lines(id, business_id) on delete restrict,
  add constraint return_financial_events_refund_attribution_check check (
    (return_line_id is null and refunded_quantity is null)
    or (event_type in ('refund', 'partial_refund') and return_line_id is not null and refunded_quantity is not null)
  );

create or replace function public.record_return_line_refund(
  target_return_line_id uuid,
  refund_quantity integer,
  refund_amount numeric,
  refund_currency text,
  refund_event_key text,
  refund_note text,
  refund_occurred_at timestamptz default now()
)
returns public.return_financial_events
language plpgsql
security definer
set search_path = public
as $$
declare
  return_line_row public.return_lines%rowtype;
  order_line_row public.order_lines%rowtype;
  event_row public.return_financial_events%rowtype;
  event_type_value text;
begin
  if refund_quantity is null or refund_quantity < 1 then raise exception 'Refund quantity must be at least one.'; end if;
  if refund_amount is null or refund_amount < 0 then raise exception 'Refund amount must be zero or greater.'; end if;
  if length(trim(refund_currency)) <> 3 or nullif(trim(refund_event_key), '') is null then raise exception 'Currency and event key are required.'; end if;

  select * into return_line_row from public.return_lines
  where id = target_return_line_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Return line was not found.'; end if;

  select * into event_row from public.return_financial_events
  where return_id = return_line_row.return_id and external_event_id = trim(refund_event_key);
  if found then return event_row; end if;

  select * into order_line_row from public.order_lines
  where id = return_line_row.order_line_id and business_id = return_line_row.business_id for update;
  if not found then raise exception 'Original order line was not found.'; end if;
  if refund_quantity > return_line_row.quantity then raise exception 'Refund quantity exceeds this return line.'; end if;
  if order_line_row.refunded_quantity + refund_quantity > order_line_row.fulfilled_quantity then
    raise exception 'Refund quantity exceeds fulfilled quantity.';
  end if;

  event_type_value := case when refund_quantity < order_line_row.fulfilled_quantity - order_line_row.refunded_quantity then 'partial_refund' else 'refund' end;
  insert into public.return_financial_events (
    business_id, owner_id, return_id, return_line_id, event_type, refunded_quantity,
    amount, currency, external_event_id, occurred_at, details
  ) values (
    return_line_row.business_id, return_line_row.owner_id, return_line_row.return_id,
    return_line_row.id, event_type_value, refund_quantity, refund_amount,
    upper(trim(refund_currency)), trim(refund_event_key), refund_occurred_at,
    jsonb_build_object('note', nullif(trim(refund_note), ''))
  ) returning * into event_row;

  update public.order_lines
  set refunded_quantity = refunded_quantity + refund_quantity
  where id = order_line_row.id;

  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_line_row.business_id, return_line_row.owner_id, 'return.line_refund_recorded', return_line_row.return_id::text,
    jsonb_build_object('return_financial_event_id', event_row.id, 'return_line_id', return_line_row.id,
      'order_line_id', order_line_row.id, 'quantity', refund_quantity, 'amount', refund_amount,
      'currency', event_row.currency));
  return event_row;
end;
$$;

revoke all on function public.record_return_line_refund(uuid, integer, numeric, text, text, text, timestamptz) from public;
grant execute on function public.record_return_line_refund(uuid, integer, numeric, text, text, text, timestamptz) to authenticated;
