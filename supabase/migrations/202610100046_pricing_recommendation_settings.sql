-- Owner-configured recommendation policy. Recommendations never mutate a listing.
alter table public.business_settings
  add column pricing_recommendations_enabled boolean not null default false,
  add column pricing_review_after_days integer not null default 30 check (pricing_review_after_days between 7 and 365),
  add column pricing_markdown_percent numeric(5,2) not null default 5 check (pricing_markdown_percent > 0 and pricing_markdown_percent <= 50);

create or replace function public.update_pricing_recommendation_settings(
  recommendations_enabled boolean,
  review_after_days integer,
  markdown_percent numeric
)
returns public.business_settings
language plpgsql
security invoker
set search_path = public
as $$
declare settings_row public.business_settings%rowtype;
begin
  if review_after_days not between 7 and 365 then raise exception 'Review age must be between 7 and 365 days.'; end if;
  if markdown_percent <= 0 or markdown_percent > 50 then raise exception 'Markdown must be greater than 0 and no more than 50 percent.'; end if;
  update public.business_settings set
    pricing_recommendations_enabled = recommendations_enabled,
    pricing_review_after_days = review_after_days,
    pricing_markdown_percent = markdown_percent
  where owner_id = auth.uid() returning * into settings_row;
  if not found then raise exception 'Business settings were not found.'; end if;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (settings_row.business_id, settings_row.owner_id, 'pricing.recommendation_settings_changed', settings_row.business_id::text,
    jsonb_build_object('enabled', recommendations_enabled, 'review_after_days', review_after_days,
      'markdown_percent', markdown_percent, 'allows_outbound_price_changes', false));
  return settings_row;
end;
$$;

revoke all on function public.update_pricing_recommendation_settings(boolean, integer, numeric) from public;
grant execute on function public.update_pricing_recommendation_settings(boolean, integer, numeric) to authenticated;
