-- Zero available quantity becomes a reviewed listing withdrawal, not a silent oversell risk.
alter table public.marketplace_action_jobs drop constraint marketplace_action_jobs_action_type_check;
alter table public.marketplace_action_jobs add constraint marketplace_action_jobs_action_type_check
  check (action_type in ('sync_quantity', 'withdraw_listing'));

create or replace function public.queue_ebay_quantity_sync(target_listing_id uuid)
returns public.marketplace_action_jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  listing_row public.marketplace_listings%rowtype;
  account_row public.marketplace_accounts%rowtype;
  item_row public.inventory_items%rowtype;
  job_row public.marketplace_action_jobs%rowtype;
  selected_action text;
  job_key text;
begin
  select * into listing_row from public.marketplace_listings
  where id = target_listing_id and owner_id = auth.uid() and platform = 'ebay' for update;
  if not found then raise exception 'eBay listing was not found.'; end if;
  select * into account_row from public.marketplace_accounts
  where id = listing_row.marketplace_account_id and owner_id = auth.uid() for update;
  if not found or account_row.outbound_paused or account_row.sync_mode not in ('review_required', 'active') then
    raise exception 'Outbound marketplace actions are paused or not approved.';
  end if;
  select * into item_row from public.inventory_items
  where id = listing_row.item_id and business_id = listing_row.business_id for update;
  if not found or item_row.verification_state <> 'verified' then
    raise exception 'Verified inventory is required before quantity synchronization.';
  end if;
  if listing_row.desired_quantity is null or listing_row.advertised_quantity is null then
    raise exception 'Both desired and observed eBay quantities are required.';
  end if;
  if listing_row.desired_quantity = listing_row.advertised_quantity then
    raise exception 'The eBay quantity is already aligned.';
  end if;
  if nullif(trim(listing_row.sku), '') is null or nullif(trim(listing_row.offer_id), '') is null then
    raise exception 'The eBay SKU and offer ID are required for quantity synchronization.';
  end if;

  selected_action := case when listing_row.desired_quantity = 0 then 'withdraw_listing' else 'sync_quantity' end;
  job_key := 'ebay-' || selected_action || ':' || listing_row.id::text || ':' || listing_row.advertised_quantity::text || ':' || listing_row.desired_quantity::text;
  insert into public.marketplace_action_jobs (
    business_id, owner_id, marketplace_account_id, marketplace_listing_id,
    action_type, payload, idempotency_key
  ) values (
    listing_row.business_id, listing_row.owner_id, listing_row.marketplace_account_id, listing_row.id,
    selected_action, jsonb_build_object(
      'sku', listing_row.sku,
      'offer_id', listing_row.offer_id,
      'quantity', listing_row.desired_quantity,
      'marketplace_region', listing_row.marketplace_region
    ), job_key
  ) on conflict (business_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning * into job_row;

  update public.marketplace_listings set sync_paused = false, quantity_sync_state = 'pending'
  where id = listing_row.id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (listing_row.business_id, listing_row.owner_id, 'marketplace.quantity_sync_queued', listing_row.id::text,
    jsonb_build_object('job_id', job_row.id, 'action_type', selected_action, 'from_quantity', listing_row.advertised_quantity, 'to_quantity', listing_row.desired_quantity));
  return job_row;
end;
$$;

create or replace function public.complete_marketplace_action_job(target_job_id uuid)
returns public.marketplace_action_jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  job_row public.marketplace_action_jobs%rowtype;
begin
  select * into job_row from public.marketplace_action_jobs
  where id = target_job_id and owner_id = auth.uid() and status = 'running' for update;
  if not found then raise exception 'Running marketplace action job was not found.'; end if;
  update public.marketplace_action_jobs set status = 'succeeded', completed_at = now()
  where id = job_row.id returning * into job_row;
  update public.marketplace_listings
  set advertised_quantity = (job_row.payload->>'quantity')::integer,
      last_confirmed_external_quantity = (job_row.payload->>'quantity')::integer,
      quantity_sync_state = case when desired_quantity = (job_row.payload->>'quantity')::integer then 'aligned' else 'paused' end,
      status = case when job_row.action_type = 'withdraw_listing' then 'ended' else status end,
      last_error = null,
      last_inbound_at = now()
  where id = job_row.marketplace_listing_id and business_id = job_row.business_id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (job_row.business_id, job_row.owner_id,
    case when job_row.action_type = 'withdraw_listing' then 'marketplace.final_unit_withdrawn' else 'marketplace.quantity_sync_succeeded' end,
    job_row.marketplace_listing_id::text,
    jsonb_build_object('job_id', job_row.id, 'quantity', (job_row.payload->>'quantity')::integer, 'attempts', job_row.attempt_count));
  return job_row;
end;
$$;
