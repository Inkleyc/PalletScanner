-- A client retry returns the active identical dismissal instead of duplicating history.
create or replace function public.dismiss_pricing_recommendation(
  target_listing_id uuid,
  proposed_price numeric
)
returns public.pricing_recommendation_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_row public.marketplace_listings%rowtype;
  item_row public.inventory_items%rowtype;
  settings_row public.business_settings%rowtype;
  expected_price numeric(12,2);
  decision_row public.pricing_recommendation_decisions%rowtype;
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
  if listing_row.created_at > now() - make_interval(days => settings_row.pricing_review_after_days) then raise exception 'The listing has not reached the configured review age.'; end if;
  expected_price := round(greatest(item_row.floor_price, item_row.listing_price * (1 - settings_row.pricing_markdown_percent / 100)), 2);
  if expected_price >= item_row.listing_price or proposed_price is null or round(proposed_price, 2) <> expected_price then
    raise exception 'The recommendation changed. Refresh pricing review before dismissing it.';
  end if;
  select * into decision_row from public.pricing_recommendation_decisions
  where marketplace_listing_id = listing_row.id and decision = 'dismissed'
    and approved_price = item_row.listing_price and suggested_price = expected_price
    and review_after_days = settings_row.pricing_review_after_days
    and markdown_percent = settings_row.pricing_markdown_percent and revisit_after > now()
  order by decided_at desc limit 1;
  if found then return decision_row; end if;
  insert into public.pricing_recommendation_decisions (
    business_id, owner_id, marketplace_listing_id, inventory_item_id, decision,
    approved_price, suggested_price, floor_price, review_after_days, markdown_percent, revisit_after
  ) values (
    listing_row.business_id, listing_row.owner_id, listing_row.id, item_row.id, 'dismissed',
    item_row.listing_price, expected_price, item_row.floor_price, settings_row.pricing_review_after_days,
    settings_row.pricing_markdown_percent, now() + make_interval(days => settings_row.pricing_review_after_days)
  ) returning * into decision_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (listing_row.business_id, listing_row.owner_id, 'pricing.recommendation_dismissed', item_row.id::text,
    jsonb_build_object('listing_id', listing_row.id, 'approved_price', item_row.listing_price,
      'suggested_price', expected_price, 'revisit_after', decision_row.revisit_after,
      'outbound_marketplace_change', false));
  return decision_row;
end;
$$;
