-- Additive quantity outcomes for future partial cancellation, shipment, and refund workflows.
-- Existing fulfillment remains unchanged; authoritative sale rows maintain fulfilled quantity.
alter table public.order_lines
  add column cancelled_quantity integer not null default 0,
  add column fulfilled_quantity integer not null default 0,
  add column refunded_quantity integer not null default 0,
  add constraint order_lines_cancelled_quantity_check
    check (cancelled_quantity between 0 and quantity),
  add constraint order_lines_fulfilled_quantity_check
    check (fulfilled_quantity between 0 and quantity - cancelled_quantity),
  add constraint order_lines_refunded_quantity_check
    check (refunded_quantity between 0 and fulfilled_quantity);

update public.order_lines line
set fulfilled_quantity = least(line.quantity, fulfilled.units)
from (
  select order_line_id, sum(quantity)::integer as units
  from public.sales
  where order_line_id is not null
  group by order_line_id
) fulfilled
where line.id = fulfilled.order_line_id;

create or replace function public.refresh_order_line_fulfilled_quantity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_line_id uuid;
  fulfilled_units integer;
begin
  target_line_id := case when tg_op = 'DELETE' then old.order_line_id else new.order_line_id end;
  if target_line_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select coalesce(sum(quantity), 0)::integer into fulfilled_units
  from public.sales where order_line_id = target_line_id;
  update public.order_lines
  set fulfilled_quantity = fulfilled_units
  where id = target_line_id;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger sales_refresh_order_line_fulfilled_quantity_insert_delete
after insert or delete on public.sales
for each row execute function public.refresh_order_line_fulfilled_quantity();

create trigger sales_refresh_order_line_fulfilled_quantity_update
after update of quantity, order_line_id on public.sales
for each row execute function public.refresh_order_line_fulfilled_quantity();

create index order_lines_open_quantity_idx
on public.order_lines(business_id, order_id)
where fulfilled_quantity + cancelled_quantity < quantity;
