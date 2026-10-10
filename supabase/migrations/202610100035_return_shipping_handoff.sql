-- Record the label purchased outside PalletFlip without pretending PalletFlip bought it.
alter table public.returns
  add column if not exists label_source text check (label_source is null or label_source in ('ebay', 'external')),
  add column if not exists label_payer text check (label_payer is null or label_payer in ('seller', 'buyer', 'marketplace')),
  add column if not exists label_cost numeric(12,2) check (label_cost is null or label_cost >= 0),
  add column if not exists label_currency text check (label_currency is null or length(label_currency) = 3),
  add column if not exists label_recorded_at timestamptz;

create or replace function public.record_return_shipping_handoff(
  target_return_id uuid,
  shipping_label_source text,
  shipping_label_payer text,
  shipping_carrier text,
  shipping_tracking_number text,
  shipping_label_cost numeric default 0,
  shipping_currency text default 'USD'
)
returns public.returns
language plpgsql
security definer
set search_path = public
as $$
declare return_row public.returns%rowtype; financial_key text;
begin
  select * into return_row from public.returns
  where id = target_return_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Return not found.'; end if;
  if shipping_label_source not in ('ebay', 'external') then raise exception 'Choose eBay or external as the label source.'; end if;
  if shipping_label_payer not in ('seller', 'buyer', 'marketplace') then raise exception 'Choose who paid for the return label.'; end if;
  if nullif(trim(shipping_carrier), '') is null or nullif(trim(shipping_tracking_number), '') is null then raise exception 'Carrier and tracking number are required.'; end if;
  if shipping_label_cost is null or shipping_label_cost < 0 or length(trim(shipping_currency)) <> 3 then raise exception 'Enter a valid label cost and three-letter currency.'; end if;
  if return_row.state in ('received', 'inspecting', 'resolved', 'closed', 'cancelled') then raise exception 'Return shipping cannot be changed after receipt or closure.'; end if;
  if return_row.tracking_number is not null then
    if return_row.tracking_number = trim(shipping_tracking_number)
      and return_row.carrier = trim(shipping_carrier)
      and return_row.label_source = shipping_label_source
      and return_row.label_payer = shipping_label_payer
      and return_row.label_cost = shipping_label_cost
      and return_row.label_currency = upper(trim(shipping_currency)) then
      return return_row;
    end if;
    raise exception 'A different return shipment is already recorded.';
  end if;

  update public.returns set
    state = 'in_transit', label_source = shipping_label_source, label_payer = shipping_label_payer,
    carrier = trim(shipping_carrier), tracking_number = trim(shipping_tracking_number),
    label_cost = shipping_label_cost, label_currency = upper(trim(shipping_currency)),
    label_recorded_at = coalesce(label_recorded_at, now())
  where id = return_row.id returning * into return_row;

  financial_key := 'return-label:' || return_row.id::text;
  if shipping_label_cost > 0 and shipping_label_payer = 'seller' then
    insert into public.return_financial_events (
      business_id, owner_id, return_id, event_type, amount, currency,
      external_event_id, occurred_at, details
    ) values (
      return_row.business_id, return_row.owner_id, return_row.id, 'return_shipping',
      shipping_label_cost, upper(trim(shipping_currency)), financial_key, now(),
      jsonb_build_object('source', shipping_label_source, 'carrier', trim(shipping_carrier), 'tracking_number', trim(shipping_tracking_number))
    ) on conflict (return_id, external_event_id) do nothing;
  end if;

  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_row.business_id, return_row.owner_id, 'return.shipping_handoff_recorded', return_row.id::text,
    jsonb_build_object('source', shipping_label_source, 'payer', shipping_label_payer, 'carrier', return_row.carrier,
      'tracking_number', return_row.tracking_number, 'cost', shipping_label_cost, 'currency', return_row.label_currency));
  return return_row;
end;
$$;

revoke all on function public.record_return_shipping_handoff(uuid, text, text, text, text, numeric, text) from public;
grant execute on function public.record_return_shipping_handoff(uuid, text, text, text, text, numeric, text) to authenticated;
