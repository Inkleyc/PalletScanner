-- Keep estimated profit honest when a marketplace import does not include seller fees.
alter table public.sales
  add column fees_state text not null default 'confirmed'
    check (fees_state in ('confirmed', 'unknown'));

create or replace function public.mark_fulfillment_sale_fees_unknown()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.source = 'marketplace_fulfillment' then
    new.fees_state := 'unknown';
  end if;
  return new;
end;
$$;

create trigger sales_mark_fulfillment_fees_unknown
before insert on public.sales
for each row execute function public.mark_fulfillment_sale_fees_unknown();

