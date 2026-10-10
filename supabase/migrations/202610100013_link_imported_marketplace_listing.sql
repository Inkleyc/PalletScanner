-- Link imported inventory to its observed eBay identity without enabling synchronization.

create or replace function public.link_imported_marketplace_listing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  observation_row public.marketplace_observations%rowtype;
  account_region text;
begin
  if new.source_observation_id is null then return new; end if;
  select * into observation_row from public.marketplace_observations
  where id = new.source_observation_id and business_id = new.business_id;
  if not found then return new; end if;
  select marketplace_region into account_region from public.marketplace_accounts
  where id = observation_row.marketplace_account_id;
  insert into public.marketplace_listings (
    business_id, owner_id, marketplace_account_id, item_id, platform, status,
    external_listing_id, offer_id, sku, marketplace_region,
    reconciliation_state, advertised_quantity, last_confirmed_external_quantity,
    last_observed_payload, last_inbound_at, sync_paused
  ) values (
    new.business_id, new.owner_id, observation_row.marketplace_account_id, new.id, 'ebay',
    case upper(coalesce(observation_row.observed_payload->>'listingStatus', ''))
      when 'PUBLISHED' then 'active' when 'ENDED' then 'ended' else 'idle' end,
    nullif(observation_row.observed_payload->>'listingId', ''),
    nullif(observation_row.observed_payload->>'offerId', ''),
    observation_row.seller_sku, account_region, 'matched',
    observation_row.observed_quantity, observation_row.observed_quantity,
    observation_row.observed_payload, observation_row.observed_at, true
  )
  on conflict (item_id, platform) do update set
    marketplace_account_id = excluded.marketplace_account_id,
    external_listing_id = coalesce(excluded.external_listing_id, public.marketplace_listings.external_listing_id),
    offer_id = coalesce(excluded.offer_id, public.marketplace_listings.offer_id),
    sku = coalesce(excluded.sku, public.marketplace_listings.sku),
    reconciliation_state = 'matched',
    last_observed_payload = excluded.last_observed_payload,
    last_inbound_at = excluded.last_inbound_at,
    sync_paused = true;
  return new;
end;
$$;

create trigger inventory_items_link_imported_listing
after insert on public.inventory_items
for each row when (new.source_observation_id is not null)
execute function public.link_imported_marketplace_listing();

insert into public.marketplace_listings (
  business_id, owner_id, marketplace_account_id, item_id, platform, status,
  external_listing_id, offer_id, sku, marketplace_region, reconciliation_state,
  advertised_quantity, last_confirmed_external_quantity, last_observed_payload,
  last_inbound_at, sync_paused
)
select item.business_id, item.owner_id, observation.marketplace_account_id, item.id, 'ebay',
  case upper(coalesce(observation.observed_payload->>'listingStatus', ''))
    when 'PUBLISHED' then 'active' when 'ENDED' then 'ended' else 'idle' end,
  nullif(observation.observed_payload->>'listingId', ''),
  nullif(observation.observed_payload->>'offerId', ''), observation.seller_sku,
  account.marketplace_region, 'matched', observation.observed_quantity,
  observation.observed_quantity, observation.observed_payload,
  observation.observed_at, true
from public.inventory_items item
join public.marketplace_observations observation on observation.id = item.source_observation_id
join public.marketplace_accounts account on account.id = observation.marketplace_account_id
on conflict (item_id, platform) do nothing;
