-- Preserve the seller-approved listing price independently from the AI price range.
alter table public.inventory_items
  add column listing_price numeric(12,2) check (listing_price is null or listing_price >= 0);

update public.inventory_items
set listing_price = high_price
where listing_price is null;

insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
select business_id, owner_id, 'inventory.listing_price_backfilled', id::text,
  jsonb_build_object('listing_price', listing_price, 'source', 'existing_high_price')
from public.inventory_items;
