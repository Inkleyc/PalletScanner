-- Carry seller-confirmed manual order details into the sale created at handoff.
create or replace function public.apply_manual_order_sale_details()
returns trigger language plpgsql security invoker set search_path = public as $$
declare order_row public.orders%rowtype;
begin
  if new.source <> 'marketplace_fulfillment' or new.order_line_id is null then return new; end if;
  select orders.* into order_row from public.order_lines line join public.orders orders on orders.id = line.order_id and orders.business_id = line.business_id
  where line.id = new.order_line_id and line.business_id = new.business_id;
  if order_row.source = 'manual' then
    new.marketplace := case when order_row.raw_payload->>'marketplace' in ('facebook', 'ebay', 'other') then order_row.raw_payload->>'marketplace' else 'other' end;
    if coalesce(order_row.pricing_summary#>>'{sellerFees,value}', order_row.pricing_summary#>>'{sellerFees,amount}', '') ~ '^[0-9]+([.][0-9]+)?$' then
      new.fees := coalesce(order_row.pricing_summary#>>'{sellerFees,value}', order_row.pricing_summary#>>'{sellerFees,amount}')::numeric;
      new.fees_state := 'confirmed';
    end if;
  end if;
  return new;
end;
$$;

create trigger sales_apply_manual_order_details
before insert on public.sales for each row execute function public.apply_manual_order_sale_details();

create or replace function public.mark_fulfillment_sale_fees_unknown()
returns trigger language plpgsql security invoker set search_path = public as $$
declare order_source text;
begin
  if new.source = 'marketplace_fulfillment' and new.order_line_id is not null then
    select orders.source into order_source from public.order_lines line join public.orders orders on orders.id = line.order_id and orders.business_id = line.business_id
    where line.id = new.order_line_id and line.business_id = new.business_id;
    if order_source <> 'manual' then new.fees_state := 'unknown'; end if;
  end if;
  return new;
end;
$$;
