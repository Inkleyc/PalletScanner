-- Carry observed eBay offer prices into the reconciled listing without authorizing writes.
create or replace function public.capture_observed_ebay_offer_price()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare observed_price numeric(12,2); observed_currency text;
begin
  if new.resource_type <> 'offer' or new.inventory_item_id is null then return new; end if;
  observed_price := case jsonb_typeof(new.observed_payload->'price')
    when 'object' then nullif(new.observed_payload#>>'{price,value}', '')::numeric
    when 'number' then (new.observed_payload->>'price')::numeric
    when 'string' then nullif(new.observed_payload->>'price', '')::numeric
    else null
  end;
  observed_currency := upper(nullif(new.observed_payload#>>'{price,currency}', ''));
  if observed_price is null or observed_price < 0 then return new; end if;
  update public.marketplace_listings set price = observed_price,
    currency = case when length(observed_currency) = 3 then observed_currency else currency end
  where item_id = new.inventory_item_id and business_id = new.business_id and platform = 'ebay';
  return new;
end;
$$;

create trigger marketplace_observations_update_offer_price
after insert on public.marketplace_observations
for each row execute function public.capture_observed_ebay_offer_price();

create or replace function public.capture_imported_listing_price()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare observation_row public.marketplace_observations%rowtype; observed_price numeric(12,2); observed_currency text;
begin
  if new.source_observation_id is null then return new; end if;
  select * into observation_row from public.marketplace_observations
  where id = new.source_observation_id and business_id = new.business_id and resource_type = 'offer';
  if not found then return new; end if;
  observed_price := case jsonb_typeof(observation_row.observed_payload->'price')
    when 'object' then nullif(observation_row.observed_payload#>>'{price,value}', '')::numeric
    when 'number' then (observation_row.observed_payload->>'price')::numeric
    when 'string' then nullif(observation_row.observed_payload->>'price', '')::numeric
    else null
  end;
  observed_currency := upper(nullif(observation_row.observed_payload#>>'{price,currency}', ''));
  if observed_price is not null and observed_price >= 0 then
    update public.marketplace_listings set price = observed_price,
      currency = case when length(observed_currency) = 3 then observed_currency else currency end
    where item_id = new.id and business_id = new.business_id and platform = 'ebay';
  end if;
  return new;
end;
$$;

create trigger inventory_items_update_imported_listing_price
after insert on public.inventory_items
for each row when (new.source_observation_id is not null)
execute function public.capture_imported_listing_price();

with parsed as (
  select id,
    case jsonb_typeof(last_observed_payload->'price')
      when 'object' then nullif(last_observed_payload#>>'{price,value}', '')::numeric
      when 'number' then (last_observed_payload->>'price')::numeric
      when 'string' then nullif(last_observed_payload->>'price', '')::numeric
      else null
    end as observed_price,
    upper(nullif(last_observed_payload#>>'{price,currency}', '')) as observed_currency
  from public.marketplace_listings
  where platform = 'ebay' and last_observed_payload ? 'price'
)
update public.marketplace_listings listing set
  price = parsed.observed_price,
  currency = case when length(parsed.observed_currency) = 3 then parsed.observed_currency else listing.currency end
from parsed where listing.id = parsed.id and parsed.observed_price >= 0;
