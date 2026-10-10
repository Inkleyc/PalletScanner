-- Identity discrepancies require a separate audited resolution before disposition.
create table public.return_identity_resolutions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  return_line_id uuid not null,
  resolution_type text not null check (resolution_type in ('identity_verified', 'wrong_item_nonstock')),
  notes text not null check (length(trim(notes)) > 0),
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (return_line_id),
  unique (id, business_id),
  foreign key (return_line_id, business_id) references public.return_lines(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

alter table public.return_identity_resolutions enable row level security;
create policy "owners read return identity resolutions" on public.return_identity_resolutions for select
  using (owner_id = auth.uid());

create or replace function public.resolve_return_identity_discrepancy(
  target_return_line_id uuid,
  selected_resolution text,
  resolution_notes text
)
returns public.return_identity_resolutions
language plpgsql
security definer
set search_path = public
as $$
declare line_row public.return_lines%rowtype; resolution_row public.return_identity_resolutions%rowtype;
begin
  if selected_resolution not in ('identity_verified', 'wrong_item_nonstock') then raise exception 'Choose a supported identity resolution.'; end if;
  if nullif(trim(resolution_notes), '') is null then raise exception 'Identity resolution notes are required.'; end if;
  select * into line_row from public.return_lines where id = target_return_line_id and owner_id = auth.uid() for update;
  if not found or line_row.inventory_state <> 'quarantined' then raise exception 'The mismatched unit must still be quarantined.'; end if;
  if not exists (select 1 from public.return_inspections where return_line_id = line_row.id and identity_result = 'mismatch') then raise exception 'No identity mismatch is recorded for this return line.'; end if;
  select * into resolution_row from public.return_identity_resolutions where return_line_id = line_row.id;
  if found then return resolution_row; end if;

  insert into public.return_identity_resolutions (business_id, owner_id, return_line_id, resolution_type, notes)
  values (line_row.business_id, line_row.owner_id, line_row.id, selected_resolution, trim(resolution_notes))
  returning * into resolution_row;
  update public.returns set state = 'inspecting' where id = line_row.return_id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (line_row.business_id, line_row.owner_id, 'return.identity_discrepancy_resolved', line_row.id::text,
    jsonb_build_object('return_id', line_row.return_id, 'resolution_type', selected_resolution,
      'restock_permitted', selected_resolution = 'identity_verified'));
  return resolution_row;
end;
$$;

create or replace function public.protect_mismatched_return_disposition()
returns trigger language plpgsql set search_path = public as $$
declare resolution_kind text;
begin
  if new.inventory_state = old.inventory_state or not exists (
    select 1 from public.return_inspections inspection
    where inspection.return_line_id = new.id and inspection.identity_result = 'mismatch'
  ) then return new; end if;
  select resolution_type into resolution_kind from public.return_identity_resolutions where return_line_id = new.id;
  if resolution_kind is null then raise exception 'Identity-mismatched return inventory must remain quarantined until the discrepancy is resolved.'; end if;
  if resolution_kind = 'wrong_item_nonstock' and new.inventory_state not in ('parts', 'supplier_return', 'discarded', 'lost') then
    raise exception 'A confirmed wrong item cannot be returned to sellable inventory.';
  end if;
  return new;
end;
$$;

revoke all on function public.resolve_return_identity_discrepancy(uuid, text, text) from public;
grant execute on function public.resolve_return_identity_discrepancy(uuid, text, text) to authenticated;
