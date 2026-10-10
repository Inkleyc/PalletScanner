-- Shipping foundation: operational fulfillment records without label purchasing or insurance automation.
alter table public.inventory_items
  add column item_weight_grams integer check (item_weight_grams is null or item_weight_grams > 0);

alter table public.orders
  add column ship_by_at timestamptz,
  add column fulfillment_method text not null default 'shipping'
    check (fulfillment_method in ('shipping', 'local_pickup', 'other'));

create table public.package_presets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  length_mm integer check (length_mm is null or length_mm > 0),
  width_mm integer check (width_mm is null or width_mm > 0),
  height_mm integer check (height_mm is null or height_mm > 0),
  tare_weight_grams integer not null default 0 check (tare_weight_grams >= 0),
  packing_allowance_grams integer not null default 0 check (packing_allowance_grams >= 0),
  default_supply_cost numeric(12,2) check (default_supply_cost is null or default_supply_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, name),
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null,
  state text not null default 'ready_to_pick' check (state in (
    'ready_to_pick', 'ready_to_pack', 'ready_for_label', 'label_purchased',
    'shipped', 'delivered', 'pickup_ready', 'picked_up', 'exception', 'cancelled'
  )),
  fulfillment_method text not null default 'shipping'
    check (fulfillment_method in ('shipping', 'local_pickup', 'other')),
  ship_by_at timestamptz,
  label_source text check (label_source is null or label_source in ('ebay', 'external', 'none')),
  carrier text,
  service text,
  tracking_number text,
  estimated_shipping_cost numeric(12,2) check (estimated_shipping_cost is null or estimated_shipping_cost >= 0),
  final_shipping_cost numeric(12,2) check (final_shipping_cost is null or final_shipping_cost >= 0),
  shipped_at timestamptz,
  delivered_at timestamptz,
  pickup_handoff_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (order_id),
  foreign key (order_id, business_id) references public.orders(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.shipment_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null,
  package_preset_id uuid,
  package_number integer not null default 1 check (package_number > 0),
  item_weight_grams integer check (item_weight_grams is null or item_weight_grams > 0),
  estimated_weight_grams integer check (estimated_weight_grams is null or estimated_weight_grams > 0),
  final_weight_grams integer check (final_weight_grams is null or final_weight_grams > 0),
  length_mm integer check (length_mm is null or length_mm > 0),
  width_mm integer check (width_mm is null or width_mm > 0),
  height_mm integer check (height_mm is null or height_mm > 0),
  measurement_state text not null default 'incomplete'
    check (measurement_state in ('incomplete', 'estimated', 'confirmed')),
  insurance_requested boolean not null default false,
  insured_value numeric(12,2) check (insured_value is null or insured_value >= 0),
  label_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (shipment_id, package_number),
  foreign key (shipment_id, business_id) references public.shipments(id, business_id) on delete cascade,
  foreign key (package_preset_id, business_id) references public.package_presets(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.shipment_package_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shipment_package_id uuid not null,
  order_line_id uuid not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (shipment_package_id, order_line_id),
  foreign key (shipment_package_id, business_id) references public.shipment_packages(id, business_id) on delete cascade,
  foreign key (order_line_id, business_id) references public.order_lines(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null,
  external_event_id text,
  status text not null,
  description text,
  location text,
  occurred_at timestamptz not null,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (shipment_id, external_event_id),
  foreign key (shipment_id, business_id) references public.shipments(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index shipments_work_queue_idx on public.shipments(business_id, state, ship_by_at);
create index tracking_events_timeline_idx on public.tracking_events(shipment_id, occurred_at desc);
create trigger package_presets_set_updated_at before update on public.package_presets for each row execute function public.set_updated_at();
create trigger shipments_set_updated_at before update on public.shipments for each row execute function public.set_updated_at();
create trigger shipment_packages_set_updated_at before update on public.shipment_packages for each row execute function public.set_updated_at();

alter table public.package_presets enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_packages enable row level security;
alter table public.shipment_package_lines enable row level security;
alter table public.tracking_events enable row level security;

create policy "owners manage package presets" on public.package_presets for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage shipments" on public.shipments for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage shipment packages" on public.shipment_packages for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage shipment package lines" on public.shipment_package_lines for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage tracking events" on public.tracking_events for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
