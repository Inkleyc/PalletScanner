-- Resolve observed price differences without authorizing an outbound marketplace write.
alter table public.marketplace_listings
  add column price_reviewed_external_price numeric(12,2) check (price_reviewed_external_price is null or price_reviewed_external_price >= 0),
  add column price_reviewed_approved_price numeric(12,2) check (price_reviewed_approved_price is null or price_reviewed_approved_price >= 0),
  add column price_review_resolution text check (price_review_resolution is null or price_review_resolution in ('keep_approved', 'adopt_external')),
  add column price_reviewed_at timestamptz;

create or replace function public.resolve_marketplace_price_review(
  target_listing_id uuid,
  selected_resolution text
)
returns public.marketplace_listings
language plpgsql
security invoker
set search_path = public
as $$
declare
  listing_row public.marketplace_listings%rowtype;
  item_row public.inventory_items%rowtype;
begin
  if selected_resolution not in ('keep_approved', 'adopt_external') then
    raise exception 'Choose whether to keep the approved price or adopt the observed marketplace price.';
  end if;
  select * into listing_row from public.marketplace_listings
  where id = target_listing_id and owner_id = auth.uid() and platform = 'ebay' for update;
  if not found then raise exception 'eBay listing was not found.'; end if;
  if listing_row.item_id is null or listing_row.price is null then
    raise exception 'A matched listing with an observed price is required.';
  end if;
  select * into item_row from public.inventory_items
  where id = listing_row.item_id and business_id = listing_row.business_id and owner_id = auth.uid() for update;
  if not found or item_row.listing_price is null then raise exception 'The approved inventory listing price was not found.'; end if;

  if selected_resolution = 'adopt_external' then
    update public.inventory_items set listing_price = listing_row.price where id = item_row.id;
  end if;
  update public.marketplace_listings set
    price_reviewed_external_price = listing_row.price,
    price_reviewed_approved_price = case when selected_resolution = 'adopt_external' then listing_row.price else item_row.listing_price end,
    price_review_resolution = selected_resolution,
    price_reviewed_at = now()
  where id = listing_row.id returning * into listing_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (listing_row.business_id, listing_row.owner_id, 'marketplace.price_review_resolved', listing_row.id::text,
    jsonb_build_object('resolution', selected_resolution, 'observed_price', listing_row.price,
      'approved_price', item_row.listing_price, 'outbound_marketplace_change', false));
  return listing_row;
end;
$$;

revoke all on function public.resolve_marketplace_price_review(uuid, text) from public;
grant execute on function public.resolve_marketplace_price_review(uuid, text) to authenticated;
