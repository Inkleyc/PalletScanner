-- Return identity evidence keeps mismatched units quarantined and auditable.
alter table public.inventory_items add column if not exists serial_number text;
alter table public.return_inspections
  add column if not exists original_serial_number text,
  add column if not exists returned_serial_number text,
  add column if not exists identity_result text not null default 'not_checked'
    check (identity_result in ('not_checked', 'match', 'mismatch', 'not_applicable'));

create table public.return_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  return_id uuid not null,
  return_line_id uuid,
  evidence_type text not null check (evidence_type in ('package', 'item', 'serial', 'damage', 'missing_parts', 'other')),
  storage_path text not null,
  file_name text not null,
  content_type text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, storage_path),
  foreign key (return_id, business_id) references public.returns(id, business_id) on delete cascade,
  foreign key (return_line_id, business_id) references public.return_lines(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index return_evidence_case_idx on public.return_evidence(return_id, captured_at);
alter table public.return_evidence enable row level security;
create policy "owners manage return evidence" on public.return_evidence for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('return-evidence', 'return-evidence', false)
on conflict (id) do update set public = excluded.public;
create policy "owners read return evidence objects" on storage.objects for select
using (bucket_id = 'return-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners upload return evidence objects" on storage.objects for insert
with check (bucket_id = 'return-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete return evidence objects" on storage.objects for delete
using (bucket_id = 'return-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.inspect_return_line_with_identity(
  target_return_line_id uuid,
  received_condition text,
  received_completeness text,
  inspection_notes text,
  disposition_recommendation text,
  original_serial text default null,
  returned_serial text default null,
  inspected_identity_result text default 'not_checked'
)
returns public.return_inspections
language plpgsql
security invoker
set search_path = public
as $$
declare line_row public.return_lines%rowtype; inspection_row public.return_inspections%rowtype;
begin
  if nullif(trim(received_condition), '') is null then raise exception 'Received condition is required.'; end if;
  if disposition_recommendation not in ('restock', 'revise', 'repair', 'parts', 'quarantine', 'supplier_return', 'discard', 'loss') then raise exception 'Choose a supported disposition recommendation.'; end if;
  if inspected_identity_result not in ('not_checked', 'match', 'mismatch', 'not_applicable') then raise exception 'Choose a supported identity result.'; end if;
  if inspected_identity_result in ('match', 'mismatch') and (nullif(trim(original_serial), '') is null or nullif(trim(returned_serial), '') is null) then raise exception 'Both serial numbers are required for identity comparison.'; end if;
  select * into line_row from public.return_lines where id = target_return_line_id and owner_id = auth.uid() for update;
  if not found or line_row.inventory_state <> 'quarantined' then raise exception 'Return inventory must be received into quarantine before inspection.'; end if;
  if inspected_identity_result = 'mismatch' and not exists (
    select 1 from public.return_evidence where return_line_id = line_row.id and evidence_type in ('serial', 'item')
  ) then raise exception 'Serial or item photo evidence is required before recording an identity mismatch.'; end if;

  insert into public.return_inspections (
    business_id, owner_id, return_line_id, condition_received, completeness, notes,
    recommended_disposition, original_serial_number, returned_serial_number, identity_result
  ) values (
    line_row.business_id, line_row.owner_id, line_row.id, trim(received_condition),
    nullif(trim(received_completeness), ''), nullif(trim(inspection_notes), ''),
    case when inspected_identity_result = 'mismatch' then 'quarantine' else disposition_recommendation end,
    nullif(trim(original_serial), ''), nullif(trim(returned_serial), ''), inspected_identity_result
  ) returning * into inspection_row;
  update public.returns set state = case when inspected_identity_result = 'mismatch' then 'exception' else 'inspecting' end where id = line_row.return_id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (line_row.business_id, line_row.owner_id,
    case when inspected_identity_result = 'mismatch' then 'return.identity_mismatch_quarantined' else 'return.inventory_inspected' end,
    line_row.id::text, jsonb_build_object('inspection_id', inspection_row.id, 'identity_result', inspected_identity_result,
      'recommended_disposition', inspection_row.recommended_disposition));
  return inspection_row;
end;
$$;

create or replace function public.protect_mismatched_return_disposition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.inventory_state <> old.inventory_state and exists (
    select 1 from public.return_inspections inspection
    where inspection.return_line_id = new.id and inspection.identity_result = 'mismatch'
  ) and new.inventory_state <> 'quarantined' then
    raise exception 'Identity-mismatched return inventory must remain quarantined until the discrepancy is resolved.';
  end if;
  return new;
end;
$$;
create trigger protect_mismatched_return_disposition before update of inventory_state on public.return_lines
for each row execute function public.protect_mismatched_return_disposition();

revoke all on function public.inspect_return_line_with_identity(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.inspect_return_line_with_identity(uuid, text, text, text, text, text, text, text) to authenticated;
revoke execute on function public.inspect_return_line(uuid, text, text, text, text) from authenticated;
