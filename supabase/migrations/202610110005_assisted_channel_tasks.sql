-- Durable work for marketplaces PalletFlip cannot update automatically.
create table public.assisted_channel_tasks (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, order_id uuid not null, order_line_id uuid not null,
  inventory_item_id uuid not null, channel text not null check (channel in ('facebook')),
  action_type text not null check (action_type in ('remove_or_adjust_listing')),
  state text not null default 'open' check (state in ('open', 'completed', 'cancelled')),
  details jsonb not null default '{}', completed_at timestamptz, created_at timestamptz not null default now(),
  unique (order_line_id, channel, action_type), unique (id, business_id),
  foreign key (order_id, business_id) references public.orders(id, business_id) on delete cascade,
  foreign key (order_line_id, business_id) references public.order_lines(id, business_id) on delete cascade,
  foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict,
  foreign key (business_id, owner_id) references public.businesses(id, owner_id) on delete cascade
);
create index assisted_channel_tasks_open_idx on public.assisted_channel_tasks(business_id, created_at) where state = 'open';
alter table public.assisted_channel_tasks enable row level security;
create policy "owners read assisted channel tasks" on public.assisted_channel_tasks for select using (owner_id = auth.uid());

create or replace function public.create_assisted_channel_task_for_order_line()
returns trigger language plpgsql security invoker set search_path = public as $$
declare order_row public.orders%rowtype;
begin
  select * into order_row from public.orders where id = new.order_id and business_id = new.business_id;
  if order_row.source = 'manual' and order_row.raw_payload->>'marketplace' = 'facebook' then
    insert into public.assisted_channel_tasks (business_id, owner_id, order_id, order_line_id, inventory_item_id, channel, action_type, details)
    values (new.business_id, new.owner_id, new.order_id, new.id, new.inventory_item_id, 'facebook', 'remove_or_adjust_listing',
      jsonb_build_object('seller_sku', new.seller_sku, 'quantity_sold', new.quantity, 'reason', 'Manual Facebook sale reserved inventory'))
    on conflict (order_line_id, channel, action_type) do nothing;
  end if;
  return new;
end;
$$;
create trigger order_lines_create_assisted_channel_task after insert on public.order_lines
for each row execute function public.create_assisted_channel_task_for_order_line();

create or replace function public.complete_assisted_channel_task(target_task_id uuid, external_action_confirmed boolean)
returns public.assisted_channel_tasks language plpgsql security definer set search_path = public as $$
declare task_row public.assisted_channel_tasks%rowtype;
begin
  if external_action_confirmed is not true then raise exception 'Confirm the marketplace listing was removed or adjusted.'; end if;
  select * into task_row from public.assisted_channel_tasks where id = target_task_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Assisted-channel task was not found.'; end if;
  if task_row.state = 'completed' then return task_row; end if;
  if task_row.state <> 'open' then raise exception 'Only open assisted-channel tasks can be completed.'; end if;
  update public.assisted_channel_tasks set state = 'completed', completed_at = now() where id = task_row.id returning * into task_row;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (task_row.business_id, task_row.owner_id, 'marketplace.assisted_action_confirmed', task_row.id::text,
    jsonb_build_object('order_id', task_row.order_id, 'order_line_id', task_row.order_line_id, 'channel', task_row.channel, 'action_type', task_row.action_type));
  return task_row;
end;
$$;

create or replace function public.cancel_assisted_tasks_with_order()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if lower(new.cancellation_state) = 'canceled' and lower(old.cancellation_state) <> 'canceled' then
    update public.assisted_channel_tasks set state = 'cancelled' where order_id = new.id and state = 'open';
  end if;
  return new;
end;
$$;
create trigger orders_cancel_assisted_tasks after update of cancellation_state on public.orders
for each row execute function public.cancel_assisted_tasks_with_order();

revoke all on function public.complete_assisted_channel_task(uuid, boolean) from public;
grant execute on function public.complete_assisted_channel_task(uuid, boolean) to authenticated;
