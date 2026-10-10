-- Record confirmed marketplace return outcomes without pretending PalletFlip submitted them.
create table public.return_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  return_id uuid not null,
  decision_type text not null check (decision_type in (
    'approve_return', 'decline', 'partial_refund', 'refund_without_return', 'replacement'
  )),
  source text not null default 'ebay_confirmed' check (source in ('ebay_confirmed', 'manual_confirmed')),
  external_event_id text not null,
  notes text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (return_id, external_event_id),
  unique (id, business_id),
  foreign key (return_id, business_id) references public.returns(id, business_id) on delete cascade,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);

create index return_decisions_return_idx on public.return_decisions(return_id, decided_at desc);
alter table public.return_decisions enable row level security;
create policy "owners manage return decisions" on public.return_decisions for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.record_confirmed_return_decision(
  target_return_id uuid,
  confirmed_decision_type text,
  confirmed_event_key text,
  confirmed_notes text default null,
  marketplace_confirmation boolean default false
)
returns public.return_decisions
language plpgsql
security definer
set search_path = public
as $$
declare return_row public.returns%rowtype; decision_row public.return_decisions%rowtype;
begin
  if marketplace_confirmation is not true then raise exception 'Confirm the decision succeeded in eBay before recording it.'; end if;
  if confirmed_decision_type not in ('approve_return', 'decline', 'partial_refund', 'refund_without_return', 'replacement') then raise exception 'Choose a supported confirmed return decision.'; end if;
  if nullif(trim(confirmed_event_key), '') is null then raise exception 'A stable decision event key is required.'; end if;

  select * into return_row from public.returns
  where id = target_return_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Return not found.'; end if;

  select * into decision_row from public.return_decisions
  where return_id = return_row.id and external_event_id = trim(confirmed_event_key);
  if found then return decision_row; end if;
  if return_row.state in ('closed', 'cancelled') then raise exception 'A closed or cancelled return cannot accept another decision.'; end if;

  insert into public.return_decisions (
    business_id, owner_id, return_id, decision_type, external_event_id, notes
  ) values (
    return_row.business_id, return_row.owner_id, return_row.id, confirmed_decision_type,
    trim(confirmed_event_key), nullif(trim(confirmed_notes), '')
  ) returning * into decision_row;

  update public.returns set
    approved_resolution = confirmed_decision_type,
    state = case
      when confirmed_decision_type in ('decline', 'partial_refund', 'refund_without_return') then 'resolved'
      else 'approved'
    end,
    resolved_at = case
      when confirmed_decision_type in ('decline', 'partial_refund', 'refund_without_return') then now()
      else resolved_at
    end
  where id = return_row.id;

  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (return_row.business_id, return_row.owner_id, 'return.marketplace_decision_confirmed', return_row.id::text,
    jsonb_build_object('return_decision_id', decision_row.id, 'decision_type', confirmed_decision_type,
      'changes_inventory', false, 'records_financial_event', false));
  return decision_row;
end;
$$;

revoke all on function public.record_confirmed_return_decision(uuid, text, text, text, boolean) from public;
grant execute on function public.record_confirmed_return_decision(uuid, text, text, text, boolean) to authenticated;
