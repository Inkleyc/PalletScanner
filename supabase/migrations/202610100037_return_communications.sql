-- Preserve marketplace return communications as append-only case history.
create table public.return_communications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  return_id uuid not null,
  direction text not null check (direction in ('seller_to_buyer', 'buyer_to_seller', 'marketplace')),
  source text not null check (source in ('ebay_confirmed', 'manual_note')),
  body text not null check (length(trim(body)) > 0),
  external_event_id text not null,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (return_id, external_event_id),
  unique (id, business_id),
  foreign key (return_id, business_id) references public.returns(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index return_communications_timeline_idx on public.return_communications(return_id, sent_at);
alter table public.return_communications enable row level security;
create policy "owners manage return communications" on public.return_communications for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.record_return_communication(
  target_return_id uuid,
  communication_direction text,
  communication_source text,
  communication_body text,
  communication_event_key text,
  communication_sent_at timestamptz default now(),
  marketplace_confirmation boolean default false
)
returns public.return_communications
language plpgsql
security definer
set search_path = public
as $$
declare return_row public.returns%rowtype; communication_row public.return_communications%rowtype;
begin
  if communication_direction not in ('seller_to_buyer', 'buyer_to_seller', 'marketplace') then raise exception 'Choose a supported communication direction.'; end if;
  if communication_source not in ('ebay_confirmed', 'manual_note') then raise exception 'Choose a supported communication source.'; end if;
  if communication_source = 'ebay_confirmed' and marketplace_confirmation is not true then raise exception 'Confirm the message exists in eBay before recording it.'; end if;
  if nullif(trim(communication_body), '') is null or nullif(trim(communication_event_key), '') is null then raise exception 'Message and stable event key are required.'; end if;

  select * into return_row from public.returns where id = target_return_id and owner_id = auth.uid();
  if not found then raise exception 'Return not found.'; end if;
  select * into communication_row from public.return_communications
  where return_id = return_row.id and external_event_id = trim(communication_event_key);
  if found then return communication_row; end if;

  insert into public.return_communications (
    business_id, owner_id, return_id, direction, source, body, external_event_id, sent_at
  ) values (
    return_row.business_id, return_row.owner_id, return_row.id, communication_direction,
    communication_source, trim(communication_body), trim(communication_event_key), communication_sent_at
  ) returning * into communication_row;

  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_row.business_id, return_row.owner_id, 'return.communication_recorded', return_row.id::text,
    jsonb_build_object('return_communication_id', communication_row.id, 'direction', communication_direction,
      'source', communication_source, 'message_submitted_by_palletflip', false));
  return communication_row;
end;
$$;

revoke all on function public.record_return_communication(uuid, text, text, text, text, timestamptz, boolean) from public;
grant execute on function public.record_return_communication(uuid, text, text, text, text, timestamptz, boolean) to authenticated;
