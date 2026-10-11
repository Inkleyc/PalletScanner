-- Apply a current aging recommendation to PalletFlip only. This never writes to a marketplace.
create or replace function public.apply_pricing_recommendation(
  target_listing_id uuid,
  proposed_price numeric
)
returns public.inventory_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  listing_row public.marketplace_listings%rowtype;
  item_row public.inventory_items%rowtype;
  settings_row public.business_settings%rowtype;
  expected_price numeric(12,2);
  previous_price numeric(12,2);
begin
  select * into listing_row from public.marketplace_listings
  where id = target_listing_id and owner_id = auth.uid() and platform = 'ebay' for update;
  if not found or listing_row.status <> 'active' then raise exception 'An active eBay listing is required.'; end if;
  select * into item_row from public.inventory_items
  where id = listing_row.item_id and business_id = listing_row.business_id and owner_id = auth.uid() for update;
  if not found or item_row.listing_price is null then raise exception 'The approved inventory listing price was not found.'; end if;
  select * into settings_row from public.business_settings
  where business_id = listing_row.business_id and owner_id = auth.uid();
  if not found or not settings_row.pricing_recommendations_enabled then raise exception 'Pricing recommendations are not enabled.'; end if;
  if listing_row.created_at > now() - make_interval(days => settings_row.pricing_review_after_days) then
    raise exception 'The listing has not reached the configured review age.';
  end if;
  expected_price := round(greatest(item_row.floor_price, item_row.listing_price * (1 - settings_row.pricing_markdown_percent / 100)), 2);
  if expected_price >= item_row.listing_price then raise exception 'No floor-safe markdown is currently available.'; end if;
  if proposed_price is null or round(proposed_price, 2) <> expected_price then
    raise exception 'The recommendation changed. Refresh pricing review before applying it.';
  end if;

  previous_price := item_row.listing_price;
  update public.inventory_items set listing_price = expected_price
  where id = item_row.id returning * into item_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (item_row.business_id, item_row.owner_id, 'pricing.recommendation_applied', item_row.id::text,
    jsonb_build_object('listing_id', listing_row.id, 'previous_price', previous_price,
      'approved_price', expected_price, 'floor_price', item_row.floor_price,
      'markdown_percent', settings_row.pricing_markdown_percent, 'outbound_marketplace_change', false));
  return item_row;
end;
$$;

revoke all on function public.apply_pricing_recommendation(uuid, numeric) from public;
grant execute on function public.apply_pricing_recommendation(uuid, numeric) to authenticated;
