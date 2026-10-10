-- Reconciliation choices are separate append-only facts; observations remain immutable.

create table public.marketplace_reconciliation_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  observation_id uuid not null,
  decision_type text not null check (decision_type in ('match_existing', 'create_new', 'ignore', 'defer')),
  inventory_item_id uuid,
  reason text,
  decided_at timestamptz not null default now(),
  foreign key (observation_id, business_id)
    references public.marketplace_observations(id, business_id) on delete cascade,
  foreign key (inventory_item_id, business_id)
    references public.inventory_items(id, business_id) on delete restrict,
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade,
  check (
    (decision_type = 'match_existing' and inventory_item_id is not null)
    or (decision_type <> 'match_existing')
  )
);

create index marketplace_reconciliation_decisions_observation_idx
on public.marketplace_reconciliation_decisions(observation_id, decided_at desc);
create index marketplace_reconciliation_decisions_business_idx
on public.marketplace_reconciliation_decisions(business_id, decided_at desc);

alter table public.marketplace_reconciliation_decisions enable row level security;

create policy "owners read marketplace reconciliation decisions"
on public.marketplace_reconciliation_decisions for select
using (owner_id = auth.uid());

create policy "owners append marketplace reconciliation decisions"
on public.marketplace_reconciliation_decisions for insert
with check (owner_id = auth.uid());
