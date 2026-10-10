-- Calculate channel quantity intent without performing outbound marketplace writes.
alter table public.marketplace_listings
  add column desired_quantity integer check (desired_quantity is null or desired_quantity >= 0),
  add column quantity_sync_state text not null default 'unknown'
    check (quantity_sync_state in ('unknown', 'aligned', 'paused', 'pending', 'error'));

create or replace function public.refresh_marketplace_quantity_intent(target_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.marketplace_listings listing
  set desired_quantity = item.available,
      quantity_sync_state = case
        when listing.advertised_quantity is null then 'unknown'
        when listing.advertised_quantity = item.available then 'aligned'
        when listing.sync_paused
          or coalesce((select account.outbound_paused from public.marketplace_accounts account where account.id = listing.marketplace_account_id), true)
          or coalesce((select account.sync_mode from public.marketplace_accounts account where account.id = listing.marketplace_account_id), 'paused') <> 'active'
          then 'paused'
        else 'pending'
      end
  from public.inventory_items item
  where listing.item_id = target_item_id and item.id = target_item_id;
end;
$$;

create or replace function public.refresh_marketplace_quantity_after_inventory()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.refresh_marketplace_quantity_intent(new.id);
  return new;
end;
$$;

create trigger inventory_items_refresh_marketplace_quantity
after update of available on public.inventory_items
for each row when (old.available is distinct from new.available)
execute function public.refresh_marketplace_quantity_after_inventory();

create or replace function public.observe_ebay_offer_quantity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  account_region text;
begin
  if new.resource_type <> 'offer' or new.inventory_item_id is null then return new; end if;
  select marketplace_region into account_region from public.marketplace_accounts
  where id = new.marketplace_account_id and business_id = new.business_id;
  insert into public.marketplace_listings (
    business_id, owner_id, marketplace_account_id, item_id, platform, status,
    external_listing_id, offer_id, sku, marketplace_region, reconciliation_state,
    advertised_quantity, last_confirmed_external_quantity, last_observed_payload,
    last_inbound_at, sync_paused, desired_quantity, quantity_sync_state
  )
  select new.business_id, new.owner_id, new.marketplace_account_id, new.inventory_item_id, 'ebay',
    case upper(coalesce(new.observed_payload->>'listingStatus', '')) when 'PUBLISHED' then 'active' when 'ENDED' then 'ended' else 'idle' end,
    nullif(new.observed_payload->>'listingId', ''), nullif(new.observed_payload->>'offerId', ''),
    new.seller_sku, account_region, 'matched', new.observed_quantity, new.observed_quantity,
    new.observed_payload, new.observed_at, true, item.available,
    case when new.observed_quantity = item.available then 'aligned' else 'paused' end
  from public.inventory_items item where item.id = new.inventory_item_id
  on conflict (item_id, platform) do update set
    marketplace_account_id = excluded.marketplace_account_id,
    external_listing_id = coalesce(excluded.external_listing_id, public.marketplace_listings.external_listing_id),
    offer_id = coalesce(excluded.offer_id, public.marketplace_listings.offer_id),
    sku = coalesce(excluded.sku, public.marketplace_listings.sku),
    status = excluded.status,
    reconciliation_state = 'matched',
    advertised_quantity = excluded.advertised_quantity,
    last_confirmed_external_quantity = excluded.last_confirmed_external_quantity,
    last_observed_payload = excluded.last_observed_payload,
    last_inbound_at = excluded.last_inbound_at,
    desired_quantity = excluded.desired_quantity,
    quantity_sync_state = case
      when excluded.advertised_quantity = excluded.desired_quantity then 'aligned'
      else 'paused'
    end;
  return new;
end;
$$;

create trigger marketplace_observations_capture_offer_quantity
after insert on public.marketplace_observations
for each row execute function public.observe_ebay_offer_quantity();

update public.marketplace_listings listing
set desired_quantity = item.available,
    quantity_sync_state = case
      when listing.advertised_quantity is null then 'unknown'
      when listing.advertised_quantity = item.available then 'aligned'
      else 'paused'
    end
from public.inventory_items item where item.id = listing.item_id;

revoke all on function public.refresh_marketplace_quantity_intent(uuid) from public;
grant execute on function public.refresh_marketplace_quantity_intent(uuid) to authenticated;
