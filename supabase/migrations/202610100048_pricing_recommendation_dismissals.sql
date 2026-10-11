-- Time-bounded dismissal for a current recommendation. A changed price produces new work immediately.
create table public.pricing_recommendation_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  marketplace_listing_id uuid not null,
  inventory_item_id uuid not null,
  decision text not null check (decision in ('dismissed')),
  approved_price numeric(12,2) not null check (approved_price >= 0),
  suggested_price numeric(12,2) not null check (suggested_price >= 0),
  floor_price numeric(12,2) not null check (floor_price >= 0),
  review_after_days integer not null check (review_after_days between 7 and 365),
  markdown_percent numeric(5,2) not null check (markdown_percent > 0 and markdown_percent <= 50),
  decided_at timestamptz not null default now(),
  revisit_after timestamptz not null,
  foreign key (marketplace_listing_id, business_id) references public.marketplace_listings(id, business_id) on delete cascade,
  foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index pricing_recommendation_decisions_current_idx
on public.pricing_recommendation_decisions(marketplace_listing_id, decided_at desc);
alter table public.pricing_recommendation_decisions enable row level security;
create policy "owners read pricing recommendation decisions" on public.pricing_recommendation_decisions
for select using (owner_id = auth.uid());

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

revoke all on function public.dismiss_pricing_recommendation(uuid, numeric) from public;
grant execute on function public.dismiss_pricing_recommendation(uuid, numeric) to authenticated;
