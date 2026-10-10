-- Persist marketplace observations without authorizing outbound marketplace writes.

create table public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('ebay')),
  marketplace_region text not null default 'EBAY_US',
  external_seller_id text,
  connection_state text not null default 'connected'
    check (connection_state in ('connected', 'reauthorization_required', 'disconnected', 'error')),
  sync_mode text not null default 'observe_only'
    check (sync_mode in ('observe_only', 'review_required', 'active', 'paused')),
  outbound_paused boolean not null default true,
  last_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel, marketplace_region),
  unique (id, business_id),
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.marketplace_import_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  marketplace_account_id uuid not null,
  mode text not null default 'observe_only' check (mode = 'observe_only'),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  inventory_count integer not null default 0 check (inventory_count >= 0),
  offer_count integer not null default 0 check (offer_count >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  uncertain_count integer not null default 0 check (uncertain_count >= 0),
  unmatched_count integer not null default 0 check (unmatched_count >= 0),
  conflicting_count integer not null default 0 check (conflicting_count >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, business_id),
  foreign key (marketplace_account_id, business_id)
    references public.marketplace_accounts(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.marketplace_observations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  marketplace_account_id uuid not null,
  import_run_id uuid not null,
  resource_type text not null check (resource_type in ('inventory_item', 'offer', 'order', 'order_line')),
  external_id text not null check (length(trim(external_id)) > 0),
  seller_sku text,
  reconciliation_state text not null default 'unmatched'
    check (reconciliation_state in ('matched', 'uncertain', 'unmatched', 'conflicting')),
  inventory_item_id uuid,
  observed_quantity integer check (observed_quantity is null or observed_quantity >= 0),
  observed_payload jsonb not null default '{}',
  observed_at timestamptz not null default now(),
  unique (import_run_id, resource_type, external_id),
  foreign key (import_run_id, business_id)
    references public.marketplace_import_runs(id, business_id) on delete cascade,
  foreign key (marketplace_account_id, business_id)
    references public.marketplace_accounts(id, business_id) on delete cascade,
  foreign key (inventory_item_id, business_id)
    references public.inventory_items(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

alter table public.marketplace_listings alter column item_id drop not null;
alter table public.marketplace_listings drop constraint if exists marketplace_listings_item_id_platform_key;
alter table public.marketplace_listings
  add column if not exists marketplace_account_id uuid,
  add column if not exists marketplace_region text,
  add column if not exists reconciliation_state text not null default 'unmatched'
    check (reconciliation_state in ('matched', 'uncertain', 'unmatched', 'conflicting', 'approved')),
  add column if not exists advertised_quantity integer check (advertised_quantity is null or advertised_quantity >= 0),
  add column if not exists last_confirmed_external_quantity integer check (last_confirmed_external_quantity is null or last_confirmed_external_quantity >= 0),
  add column if not exists price numeric(12,2) check (price is null or price >= 0),
  add column if not exists currency text check (currency is null or length(currency) = 3),
  add column if not exists last_observed_payload jsonb,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists sync_paused boolean not null default true,
  add foreign key (marketplace_account_id, business_id)
    references public.marketplace_accounts(id, business_id) on delete cascade;

create unique index marketplace_listings_item_platform_idx
on public.marketplace_listings(item_id, platform) where item_id is not null;
create unique index marketplace_listings_external_listing_idx
on public.marketplace_listings(business_id, platform, external_listing_id)
where external_listing_id is not null;
create unique index marketplace_listings_external_offer_idx
on public.marketplace_listings(business_id, platform, offer_id)
where offer_id is not null;
create index marketplace_import_runs_account_started_idx
on public.marketplace_import_runs(marketplace_account_id, started_at desc);
create index marketplace_observations_review_idx
on public.marketplace_observations(business_id, reconciliation_state, observed_at desc);

create trigger marketplace_accounts_set_updated_at
before update on public.marketplace_accounts
for each row execute function public.set_updated_at();

alter table public.marketplace_accounts enable row level security;
alter table public.marketplace_import_runs enable row level security;
alter table public.marketplace_observations enable row level security;

create policy "owners manage marketplace accounts" on public.marketplace_accounts
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read marketplace import runs" on public.marketplace_import_runs
for select using (owner_id = auth.uid());
create policy "owners append marketplace import runs" on public.marketplace_import_runs
for insert with check (owner_id = auth.uid());
create policy "owners complete marketplace import runs" on public.marketplace_import_runs
for update using (owner_id = auth.uid() and status = 'running')
with check (owner_id = auth.uid() and status in ('completed', 'failed'));
create policy "owners read marketplace observations" on public.marketplace_observations
for select using (owner_id = auth.uid());
create policy "owners append marketplace observations" on public.marketplace_observations
for insert with check (owner_id = auth.uid());

