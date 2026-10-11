-- Prevent repeated markdown recommendations immediately after an approved suggestion.
alter table public.marketplace_listings
  add column pricing_recommendation_applied_at timestamptz;

create or replace function public.mark_pricing_recommendation_applied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketplace_listings
  set pricing_recommendation_applied_at = new.occurred_at
  where id = nullif(new.details->>'listing_id', '')::uuid
    and business_id = new.business_id
    and owner_id = new.owner_id;
  return new;
end;
$$;

create trigger activity_mark_pricing_recommendation_applied
after insert on public.activity_events
for each row when (new.event_type = 'pricing.recommendation_applied')
execute function public.mark_pricing_recommendation_applied();
