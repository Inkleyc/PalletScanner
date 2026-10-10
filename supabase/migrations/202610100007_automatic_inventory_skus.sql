create or replace function public.assign_inventory_sku()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  automatic_sku boolean;
begin
  if new.seller_sku is not null and trim(new.seller_sku) <> '' then
    new.seller_sku := upper(trim(new.seller_sku));
    return new;
  end if;

  select automatic_sku_enabled
  into automatic_sku
  from public.business_settings
  where business_id = new.business_id;

  if coalesce(automatic_sku, true) then
    new.seller_sku := 'PF-' || new.client_id::text;
  end if;
  return new;
end;
$$;

create trigger inventory_items_assign_sku
before insert or update of seller_sku, business_id, client_id
on public.inventory_items
for each row execute function public.assign_inventory_sku();

update public.inventory_items item
set seller_sku = 'PF-' || item.client_id::text
where item.seller_sku is null
  and coalesce((
    select settings.automatic_sku_enabled
    from public.business_settings settings
    where settings.business_id = item.business_id
  ), true);
