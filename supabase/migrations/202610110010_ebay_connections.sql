-- PF-SCOPE-024: durable per-owner eBay connection store. The backend keeps
-- the same AES-256-GCM encrypted envelope the file token store produced;
-- only the home changes (this hosted table instead of the Render service's
-- ephemeral disk), so a redeploy or restart no longer wipes the connection.
create table public.ebay_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  envelope jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ebay_connections enable row level security;

create policy "owners read ebay connections" on public.ebay_connections
for select using (owner_id = auth.uid());
create policy "owners insert ebay connections" on public.ebay_connections
for insert with check (owner_id = auth.uid());
create policy "owners update ebay connections" on public.ebay_connections
for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete ebay connections" on public.ebay_connections
for delete using (owner_id = auth.uid());
