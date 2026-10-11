-- Preserve every seller-approved listing-price change before guarded repricing is introduced.
create or replace function public.audit_inventory_listing_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.owner_id <> auth.uid() then
    raise exception 'Listing price changes require the inventory owner.';
  end if;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (new.business_id, new.owner_id, 'inventory.listing_price_changed', new.id::text,
    jsonb_build_object('previous_price', old.listing_price, 'listing_price', new.listing_price,
      'low_price', new.low_price, 'high_price', new.high_price, 'floor_price', new.floor_price));
  return new;
end;
$$;

create trigger inventory_items_audit_listing_price
after update of listing_price on public.inventory_items
for each row when (old.listing_price is distinct from new.listing_price)
execute function public.audit_inventory_listing_price_change();
