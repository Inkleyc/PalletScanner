-- One account-level safety control for all outbound marketplace automation.
create or replace function public.set_marketplace_outbound_pause(
  target_account_id uuid,
  should_pause boolean
)
returns public.marketplace_accounts
language plpgsql
security invoker
set search_path = public
as $$
declare
  account_row public.marketplace_accounts%rowtype;
begin
  select * into account_row from public.marketplace_accounts
  where id = target_account_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Marketplace account was not found.'; end if;

  update public.marketplace_accounts
  set outbound_paused = should_pause,
      sync_mode = case
        when should_pause then 'paused'
        when account_row.sync_mode in ('observe_only', 'paused') then 'review_required'
        else account_row.sync_mode
      end
  where id = account_row.id
  returning * into account_row;

  update public.marketplace_listings listing
  set quantity_sync_state = case
    when listing.advertised_quantity is null then 'unknown'
    when listing.advertised_quantity = listing.desired_quantity then 'aligned'
    when should_pause or listing.sync_paused or account_row.sync_mode <> 'active' then 'paused'
    else 'pending'
  end
  where listing.marketplace_account_id = account_row.id;

  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (account_row.business_id, account_row.owner_id, 'marketplace.outbound_pause_changed', account_row.id::text,
    jsonb_build_object('channel', account_row.channel, 'outbound_paused', should_pause, 'sync_mode', account_row.sync_mode));
  return account_row;
end;
$$;

revoke all on function public.set_marketplace_outbound_pause(uuid, boolean) from public;
grant execute on function public.set_marketplace_outbound_pause(uuid, boolean) to authenticated;
