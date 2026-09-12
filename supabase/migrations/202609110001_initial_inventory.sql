-- PalletScanner's initial user-owned data model.
-- Client IDs preserve today's local data while UUIDs provide safe server keys.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.pallets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null check (length(trim(name)) > 0),
  purchase_cost numeric(12,2) check (purchase_cost is null or purchase_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id),
  unique (id, owner_id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pallet_id uuid not null,
  client_id bigint not null,
  name text not null check (length(trim(name)) > 0),
  condition text not null default 'Unknown',
  quantity integer not null default 1 check (quantity > 0),
  low_price numeric(12,2) not null default 0 check (low_price >= 0),
  high_price numeric(12,2) not null default 0 check (high_price >= low_price),
  floor_price numeric(12,2) not null default 0 check (floor_price >= 0),
  best_platform text not null default 'Review',
  workflow_status text not null default 'captured' check (workflow_status in ('captured', 'needs_photos', 'needs_research', 'ready', 'sold')),
  listing_title text not null default '',
  listing_description text not null default '',
  facebook_title text,
  facebook_description text,
  ebay_title text,
  ebay_description text,
  listed_platforms text[] not null default '{}',
  sold_price numeric(12,2) check (sold_price is null or sold_price >= 0),
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id),
  unique (id, owner_id),
  foreign key (pallet_id, owner_id) references public.pallets(id, owner_id) on delete cascade
);

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  storage_path text not null,
  position smallint not null default 0 check (position between 0 and 20),
  created_at timestamptz not null default now(),
  unique (item_id, position),
  unique (storage_path),
  foreign key (item_id, owner_id) references public.inventory_items(id, owner_id) on delete cascade
);

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  platform text not null check (platform in ('facebook', 'ebay')),
  status text not null default 'idle' check (status in ('idle', 'opened', 'posting', 'active', 'ended', 'error')),
  external_listing_id text,
  listing_url text,
  sku text,
  offer_id text,
  category_id text,
  category_name text,
  progress text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, platform),
  foreign key (item_id, owner_id) references public.inventory_items(id, owner_id) on delete cascade
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  marketplace text not null check (marketplace in ('facebook', 'ebay', 'other')),
  sold_price numeric(12,2) not null check (sold_price >= 0),
  fees numeric(12,2) not null default 0 check (fees >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (item_id, owner_id) references public.inventory_items(id, owner_id) on delete cascade
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_id text not null,
  details jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index inventory_items_owner_pallet_idx on public.inventory_items(owner_id, pallet_id);
create index inventory_items_owner_status_idx on public.inventory_items(owner_id, workflow_status);
create index item_photos_item_position_idx on public.item_photos(item_id, position);
create index marketplace_listings_owner_status_idx on public.marketplace_listings(owner_id, status);
create index sales_owner_sold_at_idx on public.sales(owner_id, sold_at desc);
create index activity_events_owner_occurred_idx on public.activity_events(owner_id, occurred_at desc);

create trigger pallets_set_updated_at before update on public.pallets for each row execute function public.set_updated_at();
create trigger inventory_items_set_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger marketplace_listings_set_updated_at before update on public.marketplace_listings for each row execute function public.set_updated_at();

alter table public.pallets enable row level security;
alter table public.inventory_items enable row level security;
alter table public.item_photos enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.sales enable row level security;
alter table public.activity_events enable row level security;

create policy "owners manage pallets" on public.pallets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage inventory" on public.inventory_items for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage item photos" on public.item_photos for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage listings" on public.marketplace_listings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage sales" on public.sales for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read activity" on public.activity_events for select using (owner_id = auth.uid());
create policy "owners append activity" on public.activity_events for insert with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do update set public = false;

create policy "owners read item photo objects" on storage.objects for select
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners upload item photo objects" on storage.objects for insert
with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners update item photo objects" on storage.objects for update
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete item photo objects" on storage.objects for delete
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);
