-- Snapshot the approved unit listing price for future price-realization reporting.
alter table public.sales
  add column listing_price_at_sale numeric(12,2) check (listing_price_at_sale is null or listing_price_at_sale >= 0),
  add column price_snapshot_source text not null default 'legacy_unknown'
    check (price_snapshot_source in ('legacy_unknown', 'approved_at_sale'));

create or replace function public.capture_sale_listing_price()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare approved_price numeric(12,2);
begin
  select listing_price into approved_price from public.inventory_items
  where id = new.item_id and owner_id = new.owner_id;
  if approved_price is not null then
    new.listing_price_at_sale := approved_price;
    new.price_snapshot_source := 'approved_at_sale';
  else
    new.listing_price_at_sale := null;
    new.price_snapshot_source := 'legacy_unknown';
  end if;
  return new;
end;
$$;

create trigger sales_capture_listing_price
before insert on public.sales
for each row execute function public.capture_sale_listing_price();
