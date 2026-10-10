-- Durable reviewed work queue. Creating a job does not call an external marketplace.
alter table public.marketplace_listings add constraint marketplace_listings_id_business_unique unique (id, business_id);
create table public.marketplace_action_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  marketplace_account_id uuid not null,
  marketplace_listing_id uuid,
  action_type text not null check (action_type in ('sync_quantity')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'retry_wait', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  idempotency_key text not null,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id, idempotency_key),
  foreign key (marketplace_account_id, business_id) references public.marketplace_accounts(id, business_id) on delete cascade,
  foreign key (marketplace_listing_id, business_id) references public.marketplace_listings(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index marketplace_action_jobs_due_idx on public.marketplace_action_jobs(status, next_attempt_at)
where status in ('pending', 'retry_wait');
create trigger marketplace_action_jobs_set_updated_at before update on public.marketplace_action_jobs
for each row execute function public.set_updated_at();
alter table public.marketplace_action_jobs enable row level security;
create policy "owners read marketplace action jobs" on public.marketplace_action_jobs
for select using (owner_id = auth.uid());
create policy "owners queue marketplace action jobs" on public.marketplace_action_jobs
for insert with check (owner_id = auth.uid() and status = 'pending' and attempt_count = 0);

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

  job_key := 'ebay-quantity:' || listing_row.id::text || ':' || listing_row.advertised_quantity::text || ':' || listing_row.desired_quantity::text;
  insert into public.marketplace_action_jobs (
    business_id, owner_id, marketplace_account_id, marketplace_listing_id,
    action_type, payload, idempotency_key
  ) values (
    listing_row.business_id, listing_row.owner_id, listing_row.marketplace_account_id, listing_row.id,
    'sync_quantity', jsonb_build_object(
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
    jsonb_build_object('job_id', job_row.id, 'from_quantity', listing_row.advertised_quantity, 'to_quantity', listing_row.desired_quantity));
  return job_row;
end;
$$;

revoke all on function public.queue_ebay_quantity_sync(uuid) from public;
grant execute on function public.queue_ebay_quantity_sync(uuid) to authenticated;
