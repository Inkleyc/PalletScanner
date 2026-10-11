-- Resolve imported fee gaps through an explicit, audited confirmation.
create or replace function public.confirm_sale_fees(target_sale_id uuid, confirmed_fees numeric)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare sale_row public.sales%rowtype;
begin
  if confirmed_fees is null or confirmed_fees < 0 then raise exception 'Confirmed marketplace fees must be zero or greater.'; end if;
  select * into sale_row from public.sales where id = target_sale_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Sale was not found.'; end if;
  if sale_row.source <> 'marketplace_fulfillment' then raise exception 'Only imported fulfillment sales use fee confirmation.'; end if;
  if sale_row.fees_state = 'confirmed' then
    if sale_row.fees = confirmed_fees then return sale_row; end if;
    raise exception 'Marketplace fees were already confirmed for this sale.';
  end if;
  update public.sales set fees = confirmed_fees, fees_state = 'confirmed' where id = sale_row.id returning * into sale_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (sale_row.business_id, sale_row.owner_id, 'sale.marketplace_fees_confirmed', sale_row.id::text,
    jsonb_build_object('order_line_id', sale_row.order_line_id, 'fees', sale_row.fees, 'source', 'manual_confirmation'));
  return sale_row;
end;
$$;

revoke all on function public.confirm_sale_fees(uuid, numeric) from public;
grant execute on function public.confirm_sale_fees(uuid, numeric) to authenticated;
