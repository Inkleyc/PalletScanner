-- Returns foundation: preserve marketplace truth, deadlines, inspection, disposition, and money history.
create table public.returns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null,
  source text not null check (source in ('ebay', 'manual')),
  external_return_id text not null,
  state text not null default 'requested' check (state in (
    'requested', 'action_required', 'approved', 'in_transit', 'received',
    'inspecting', 'resolved', 'closed', 'cancelled', 'exception'
  )),
  requested_resolution text,
  approved_resolution text,
  responsibility text check (responsibility is null or responsibility in ('seller', 'buyer', 'carrier', 'marketplace', 'unknown')),
  reason text,
  action_due_at timestamptz,
  ship_by_at timestamptz,
  tracking_number text,
  carrier text,
  raw_payload jsonb not null default '{}',
  external_created_at timestamptz,
  external_updated_at timestamptz,
  received_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, source, external_return_id),
  foreign key (order_id, business_id) references public.orders(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.return_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  return_id uuid not null,
  order_line_id uuid not null,
  external_return_line_id text not null,
  quantity integer not null check (quantity > 0),
  inventory_item_id uuid,
  inventory_state text not null default 'unavailable' check (inventory_state in (
    'unavailable', 'quarantined', 'restocked', 'repaired', 'parts',
    'supplier_return', 'discarded', 'lost'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (return_id, external_return_line_id),
  unique (id, business_id),
  foreign key (return_id, business_id) references public.returns(id, business_id) on delete cascade,
  foreign key (order_line_id, business_id) references public.order_lines(id, business_id) on delete restrict,
  foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.return_inspections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  return_line_id uuid not null,
  condition_received text not null,
  completeness text,
  notes text,
  recommended_disposition text check (recommended_disposition is null or recommended_disposition in (
    'restock', 'revise', 'repair', 'parts', 'quarantine', 'supplier_return', 'discard', 'loss'
  )),
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (return_line_id, business_id) references public.return_lines(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create table public.return_financial_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  return_id uuid not null,
  event_type text not null check (event_type in ('refund', 'partial_refund', 'fee_credit', 'return_shipping', 'replacement_shipping', 'other')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD' check (length(currency) = 3),
  external_event_id text,
  occurred_at timestamptz not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (return_id, external_event_id),
  foreign key (return_id, business_id) references public.returns(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index returns_work_queue_idx on public.returns(business_id, state, action_due_at);
create index return_lines_inventory_state_idx on public.return_lines(business_id, inventory_state);
create trigger returns_set_updated_at before update on public.returns for each row execute function public.set_updated_at();
create trigger return_lines_set_updated_at before update on public.return_lines for each row execute function public.set_updated_at();

alter table public.returns enable row level security;
alter table public.return_lines enable row level security;
alter table public.return_inspections enable row level security;
alter table public.return_financial_events enable row level security;
create policy "owners manage returns" on public.returns for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage return lines" on public.return_lines for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage return inspections" on public.return_inspections for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage return financial events" on public.return_financial_events for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
