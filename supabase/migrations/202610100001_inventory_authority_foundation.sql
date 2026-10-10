-- Additive inventory-authority foundation. Existing owner-scoped data remains
-- readable while clients migrate to business/acquisition and ledger contracts.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My PalletFlip Business' check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id),
  unique (id, owner_id)
);

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id),
  unique (business_id, user_id, role)
);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  automatic_sku_enabled boolean not null default true,
  location_tracking_enabled boolean not null default false,
  prompt_to_post_on_save boolean not null default false,
  outbound_automation_paused boolean not null default false,
  timezone text not null default 'America/Denver',
  currency text not null default 'USD' check (length(currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, owner_id),
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

insert into public.businesses (owner_id)
select id from auth.users
on conflict (owner_id) do nothing;

insert into public.business_memberships (business_id, user_id, role)
select id, owner_id, 'owner' from public.businesses
on conflict (business_id, user_id) do nothing;

insert into public.business_settings (business_id, owner_id)
select id, owner_id from public.businesses
on conflict (business_id) do nothing;

create or replace function public.create_owner_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  created_business_id uuid;
begin
  insert into public.businesses (owner_id)
  values (new.id)
  on conflict (owner_id) do update set owner_id = excluded.owner_id
  returning id into created_business_id;

  insert into public.business_memberships (business_id, user_id, role)
  values (created_business_id, new.id, 'owner')
  on conflict (business_id, user_id) do nothing;

  insert into public.business_settings (business_id, owner_id)
  values (created_business_id, new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

create trigger auth_user_create_owner_business
after insert on auth.users
for each row execute function public.create_owner_business();

alter table public.pallets add column business_id uuid;
alter table public.pallets add column is_system boolean not null default false;
alter table public.pallets add column acquisition_type text not null default 'pallet'
  check (acquisition_type in ('pallet', 'loose_system'));
alter table public.inventory_items add column business_id uuid;
alter table public.marketplace_listings add column business_id uuid;
alter table public.sales add column business_id uuid;
alter table public.activity_events add column business_id uuid;

update public.pallets p set business_id = business.id
from public.businesses business where business.owner_id = p.owner_id;
update public.inventory_items item set business_id = business.id
from public.businesses business where business.owner_id = item.owner_id;
update public.marketplace_listings listing set business_id = business.id
from public.businesses business where business.owner_id = listing.owner_id;
update public.sales sale set business_id = business.id
from public.businesses business where business.owner_id = sale.owner_id;
update public.activity_events event set business_id = business.id
from public.businesses business where business.owner_id = event.owner_id;

alter table public.pallets alter column business_id set not null;
alter table public.inventory_items alter column business_id set not null;
alter table public.marketplace_listings alter column business_id set not null;
alter table public.sales alter column business_id set not null;
alter table public.activity_events alter column business_id set not null;

insert into public.pallets (
  owner_id, business_id, client_id, name, purchase_cost, is_system, acquisition_type
)
select owner_id, id, 'loose-items', 'Loose Items', null, true, 'loose_system'
from public.businesses
on conflict (owner_id, client_id) do update
set is_system = true, acquisition_type = 'loose_system', name = 'Loose Items';

create table public.acquisitions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_pallet_id uuid,
  type text not null check (type in ('pallet', 'lot', 'individual', 'loose_system', 'other')),
  name text not null check (length(trim(name)) > 0),
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  inbound_freight numeric(12,2) not null default 0 check (inbound_freight >= 0),
  buyers_premium numeric(12,2) not null default 0 check (buyers_premium >= 0),
  acquisition_tax numeric(12,2) not null default 0 check (acquisition_tax >= 0),
  status text not null default 'active' check (status in ('active', 'closed', 'archived')),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (legacy_pallet_id),
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create unique index acquisitions_one_loose_system_idx
on public.acquisitions(business_id) where type = 'loose_system';

insert into public.acquisitions (
  id, business_id, owner_id, legacy_pallet_id, type, name, purchase_price, created_at
)
select id, business_id, owner_id, id, acquisition_type, name, purchase_cost, created_at
from public.pallets
on conflict (id) do nothing;

insert into public.acquisitions (business_id, owner_id, type, name, is_system)
select id, owner_id, 'loose_system', 'Loose Items', true
from public.businesses
on conflict (business_id) where type = 'loose_system' do nothing;

alter table public.inventory_items
  add column acquisition_id uuid,
  add column seller_sku text,
  add column archived_at timestamptz,
  add column on_hand integer not null default 0,
  add column reserved integer not null default 0,
  add column available integer not null default 0,
  add column shortage integer not null default 0;

update public.inventory_items set acquisition_id = pallet_id;
update public.inventory_items
set on_hand = case when sold_price is null then quantity else 0 end,
    available = case when sold_price is null then quantity else 0 end;

alter table public.inventory_items alter column acquisition_id set not null;
alter table public.inventory_items alter column pallet_id drop not null;
alter table public.inventory_items
  add foreign key (acquisition_id, business_id)
  references public.acquisitions(id, business_id) on delete restrict;

create unique index inventory_items_business_sku_idx
on public.inventory_items(business_id, seller_sku) where seller_sku is not null;
create unique index inventory_items_id_business_idx
on public.inventory_items(id, business_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid not null,
  quantity integer not null check (quantity <> 0),
  movement_type text not null check (movement_type in (
    'receipt', 'correction', 'sale', 'return_receipt', 'restock', 'damage',
    'loss', 'discard', 'bundle_consumption', 'split', 'merge'
  )),
  reason text,
  source_type text,
  source_id text,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  foreign key (inventory_item_id, business_id)
    references public.inventory_items(id, business_id) on delete restrict,
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

insert into public.inventory_movements (
  business_id, owner_id, inventory_item_id, quantity, movement_type,
  reason, source_type, source_id, idempotency_key, occurred_at
)
select business_id, owner_id, id, quantity, 'receipt',
  'Opening balance migrated from legacy inventory', 'legacy_inventory', client_id::text,
  'legacy-receipt:' || id::text, captured_at
from public.inventory_items
on conflict (business_id, idempotency_key) do nothing;

insert into public.inventory_movements (
  business_id, owner_id, inventory_item_id, quantity, movement_type,
  reason, source_type, source_id, idempotency_key, occurred_at
)
select business_id, owner_id, id, -quantity, 'sale',
  'Legacy sale migrated from sold inventory', 'legacy_sale', client_id::text,
  'legacy-sale:' || id::text, updated_at
from public.inventory_items where sold_price is not null
on conflict (business_id, idempotency_key) do nothing;

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid not null,
  source_type text not null,
  source_id text not null,
  requested_quantity integer not null check (requested_quantity > 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  released_quantity integer not null default 0 check (released_quantity >= 0),
  consumed_quantity integer not null default 0 check (consumed_quantity >= 0),
  shortage_quantity integer not null default 0 check (shortage_quantity >= 0),
  state text not null default 'active' check (state in ('active', 'released', 'consumed', 'shortage')),
  idempotency_key text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  foreign key (inventory_item_id, business_id)
    references public.inventory_items(id, business_id) on delete restrict,
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

create or replace function public.assign_owner_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is null then
    select id into new.business_id from public.businesses where owner_id = new.owner_id;
  end if;
  return new;
end;
$$;

create or replace function public.assign_inventory_authority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is null then
    select id into new.business_id from public.businesses where owner_id = new.owner_id;
  end if;
  if new.acquisition_id is null and new.pallet_id is not null then
    new.acquisition_id := new.pallet_id;
  end if;
  return new;
end;
$$;

create trigger pallets_assign_business before insert or update on public.pallets
for each row execute function public.assign_owner_business();
create trigger inventory_items_assign_authority before insert or update on public.inventory_items
for each row execute function public.assign_inventory_authority();
create trigger marketplace_listings_assign_business before insert or update on public.marketplace_listings
for each row execute function public.assign_owner_business();
create trigger sales_assign_business before insert or update on public.sales
for each row execute function public.assign_owner_business();
create trigger activity_events_assign_business before insert or update on public.activity_events
for each row execute function public.assign_owner_business();

create index inventory_movements_item_time_idx
on public.inventory_movements(inventory_item_id, occurred_at);
create index inventory_reservations_item_state_idx
on public.inventory_reservations(inventory_item_id, state);

create trigger businesses_set_updated_at before update on public.businesses
for each row execute function public.set_updated_at();
create trigger business_settings_set_updated_at before update on public.business_settings
for each row execute function public.set_updated_at();
create trigger acquisitions_set_updated_at before update on public.acquisitions
for each row execute function public.set_updated_at();
create trigger inventory_reservations_set_updated_at before update on public.inventory_reservations
for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_settings enable row level security;
alter table public.acquisitions enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_reservations enable row level security;

create policy "owners manage businesses" on public.businesses
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage memberships" on public.business_memberships
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners manage business settings" on public.business_settings
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage acquisitions" on public.acquisitions
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read movements" on public.inventory_movements
for select using (owner_id = auth.uid());
create policy "owners append movements" on public.inventory_movements
for insert with check (owner_id = auth.uid());
create policy "owners manage reservations" on public.inventory_reservations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
