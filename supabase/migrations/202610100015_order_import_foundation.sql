-- Durable, idempotent order intake. Reservation automation remains disabled.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  marketplace_account_id uuid,
  source text not null check (source in ('ebay', 'manual')),
  external_order_id text not null,
  payment_state text not null default 'unknown',
  fulfillment_state text not null default 'unknown',
  currency text check (currency is null or length(currency) = 3),
  pricing_summary jsonb not null default '{}',
  raw_payload jsonb not null default '{}',
  external_created_at timestamptz,
  external_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, source, external_order_id),
  unique (id, business_id),
  foreign key (marketplace_account_id, business_id) references public.marketplace_accounts(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null,
  external_line_id text not null,
  seller_sku text,
  title text,
  quantity integer not null check (quantity > 0),
  inventory_item_id uuid,
  match_state text not null default 'unmatched' check (match_state in ('matched', 'uncertain', 'unmatched', 'conflicting')),
  line_cost jsonb not null default '{}',
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (order_id, external_line_id),
  unique (id, business_id),
  foreign key (order_id, business_id) references public.orders(id, business_id) on delete cascade,
  foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index orders_business_fulfillment_idx on public.orders(business_id, fulfillment_state, external_created_at desc);
create index order_lines_unmatched_idx on public.order_lines(business_id, match_state) where match_state <> 'matched';
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
create policy "owners read orders" on public.orders for select using (owner_id = auth.uid());
create policy "owners append orders" on public.orders for insert with check (owner_id = auth.uid());
create policy "owners update imported orders" on public.orders for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read order lines" on public.order_lines for select using (owner_id = auth.uid());
create policy "owners append order lines" on public.order_lines for insert with check (owner_id = auth.uid());
create policy "owners update order-line matches" on public.order_lines for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
