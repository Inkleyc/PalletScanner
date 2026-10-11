-- Buyer-paid shipping is revenue; label cost remains a separate seller expense.
alter table public.sales
  add column shipping_income numeric(12,2) not null default 0 check (shipping_income >= 0);

create or replace function public.capture_fulfillment_shipping_income()
returns trigger language plpgsql security invoker set search_path = public as $$
declare line_row public.order_lines%rowtype; delivery numeric := 0; eligible_revenue numeric := 0; eligible_quantity integer := 0; line_revenue numeric := 0;
begin
  if new.source <> 'marketplace_fulfillment' then return new; end if;
  select * into line_row from public.order_lines where id = new.order_line_id and business_id = new.business_id;
  select case when coalesce(pricing_summary#>>'{deliveryCost,value}', pricing_summary#>>'{deliveryCost,amount}', '') ~ '^[0-9]+([.][0-9]+)?$'
    then coalesce(pricing_summary#>>'{deliveryCost,value}', pricing_summary#>>'{deliveryCost,amount}')::numeric else 0 end
  into delivery from public.orders where id = line_row.order_id and business_id = new.business_id;
  select coalesce(sum(case when coalesce(line_cost->>'value', line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then coalesce(line_cost->>'value', line_cost->>'amount')::numeric else 0 end), 0),
    coalesce(sum(case when coalesce(line_cost->>'value', line_cost->>'amount', '') ~ '^[0-9]+([.][0-9]+)?$' then quantity else 0 end), 0)
  into eligible_revenue, eligible_quantity from public.order_lines where order_id = line_row.order_id;
  line_revenue := new.sold_price;
  new.shipping_income := case when delivery = 0 then 0 when eligible_revenue > 0 then round(delivery * line_revenue / eligible_revenue, 2)
    when eligible_quantity > 0 then round(delivery * new.quantity::numeric / eligible_quantity, 2) else 0 end;
  return new;
end;
$$;

create trigger sales_capture_fulfillment_shipping_income
before insert or update of order_line_id, sold_price, quantity, source on public.sales
for each row execute function public.capture_fulfillment_shipping_income();

-- Safely repair fulfillment sales created before this migration was applied.
update public.sales set source = source where source = 'marketplace_fulfillment';

