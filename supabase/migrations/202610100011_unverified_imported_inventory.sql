-- Imported marketplace records carry no trusted stock until physically verified.

alter table public.inventory_items drop constraint if exists inventory_items_quantity_check;
alter table public.inventory_items add constraint inventory_items_quantity_check check (quantity >= 0);
alter table public.inventory_items
  add column verification_state text not null default 'verified'
    check (verification_state in ('verified', 'unverified_import')),
  add column source_observation_id uuid,
  add foreign key (source_observation_id, business_id)
    references public.marketplace_observations(id, business_id) on delete restrict;

create unique index inventory_items_source_observation_idx
on public.inventory_items(source_observation_id) where source_observation_id is not null;

create or replace function public.create_unverified_inventory_from_observation(
  target_observation_id uuid
)
returns public.inventory_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  observation_row public.marketplace_observations%rowtype;
  latest_decision public.marketplace_reconciliation_decisions%rowtype;
  loose_acquisition public.acquisitions%rowtype;
  loose_pallet public.pallets%rowtype;
  existing_item public.inventory_items%rowtype;
  created_item public.inventory_items%rowtype;
  next_client_id bigint;
begin
  select * into observation_row from public.marketplace_observations
  where id = target_observation_id and owner_id = auth.uid();
  if not found or observation_row.resource_type = 'order' then
    raise exception 'Eligible marketplace observation was not found.';
  end if;

  select * into existing_item from public.inventory_items
  where source_observation_id = target_observation_id;
  if found then return existing_item; end if;

  select * into latest_decision from public.marketplace_reconciliation_decisions
  where observation_id = target_observation_id and owner_id = auth.uid()
  order by decided_at desc limit 1;
  if not found or latest_decision.decision_type <> 'create_new' then
    raise exception 'A current create-new reconciliation decision is required.';
  end if;

  select * into loose_acquisition from public.acquisitions
  where business_id = observation_row.business_id and type = 'loose_system';
  select * into loose_pallet from public.pallets
  where business_id = observation_row.business_id and acquisition_type = 'loose_system';
  if loose_acquisition.id is null or loose_pallet.id is null then
    raise exception 'Loose Items storage is not configured.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(observation_row.business_id::text, 0));
  select coalesce(max(client_id), 0) + 1 into next_client_id
  from public.inventory_items where business_id = observation_row.business_id;

  insert into public.inventory_items (
    business_id, owner_id, acquisition_id, pallet_id, client_id, name,
    product_barcode, condition, quantity, workflow_status, verification_state,
    source_observation_id, listing_title
  ) values (
    observation_row.business_id, observation_row.owner_id, loose_acquisition.id,
    loose_pallet.id, next_client_id,
    coalesce(nullif(observation_row.observed_payload->>'title', ''), nullif(observation_row.seller_sku, ''), 'Unverified eBay item'),
    coalesce(observation_row.observed_payload#>>'{productIdentifiers,upc,0}', observation_row.observed_payload#>>'{productIdentifiers,ean,0}', observation_row.observed_payload#>>'{productIdentifiers,isbn,0}'),
    coalesce(nullif(observation_row.observed_payload->>'condition', ''), 'Unknown'),
    0, 'needs_research', 'unverified_import', observation_row.id,
    coalesce(observation_row.observed_payload->>'title', '')
  ) returning * into created_item;
  return created_item;
end;
$$;

revoke all on function public.create_unverified_inventory_from_observation(uuid) from public;
grant execute on function public.create_unverified_inventory_from_observation(uuid) to authenticated;
