-- Atomic job lifecycle used by the protected marketplace executor.
create or replace function public.claim_marketplace_action_job(target_job_id uuid)
returns public.marketplace_action_jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  job_row public.marketplace_action_jobs%rowtype;
  account_row public.marketplace_accounts%rowtype;
begin
  select * into job_row from public.marketplace_action_jobs
  where id = target_job_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Marketplace action job was not found.'; end if;
  if (job_row.status not in ('pending', 'retry_wait') and not (job_row.status = 'running' and job_row.updated_at < now() - interval '5 minutes'))
    or job_row.next_attempt_at > now() or job_row.attempt_count >= job_row.max_attempts then
    raise exception 'Marketplace action job is not ready to run.';
  end if;
  select * into account_row from public.marketplace_accounts
  where id = job_row.marketplace_account_id and owner_id = auth.uid() for update;
  if not found or account_row.outbound_paused or account_row.sync_mode not in ('review_required', 'active') then
    raise exception 'Outbound marketplace actions are paused or not approved.';
  end if;
  update public.marketplace_action_jobs
  set status = 'running', attempt_count = attempt_count + 1, last_error = null
  where id = job_row.id returning * into job_row;
  return job_row;
end;
$$;

create or replace function public.complete_marketplace_action_job(target_job_id uuid)
returns public.marketplace_action_jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  job_row public.marketplace_action_jobs%rowtype;
begin
  select * into job_row from public.marketplace_action_jobs
  where id = target_job_id and owner_id = auth.uid() and status = 'running' for update;
  if not found then raise exception 'Running marketplace action job was not found.'; end if;
  update public.marketplace_action_jobs set status = 'succeeded', completed_at = now()
  where id = job_row.id returning * into job_row;
  update public.marketplace_listings
  set advertised_quantity = (job_row.payload->>'quantity')::integer,
      last_confirmed_external_quantity = (job_row.payload->>'quantity')::integer,
      quantity_sync_state = case when desired_quantity = (job_row.payload->>'quantity')::integer then 'aligned' else 'paused' end,
      last_error = null,
      last_inbound_at = now()
  where id = job_row.marketplace_listing_id and business_id = job_row.business_id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (job_row.business_id, job_row.owner_id, 'marketplace.quantity_sync_succeeded', job_row.marketplace_listing_id::text,
    jsonb_build_object('job_id', job_row.id, 'quantity', (job_row.payload->>'quantity')::integer, 'attempts', job_row.attempt_count));
  return job_row;
end;
$$;

create or replace function public.fail_marketplace_action_job(target_job_id uuid, failure_message text)
returns public.marketplace_action_jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  job_row public.marketplace_action_jobs%rowtype;
  exhausted boolean;
begin
  if nullif(trim(failure_message), '') is null then raise exception 'A failure message is required.'; end if;
  select * into job_row from public.marketplace_action_jobs
  where id = target_job_id and owner_id = auth.uid() and status = 'running' for update;
  if not found then raise exception 'Running marketplace action job was not found.'; end if;
  exhausted := job_row.attempt_count >= job_row.max_attempts;
  update public.marketplace_action_jobs
  set status = case when exhausted then 'failed' else 'retry_wait' end,
      next_attempt_at = case when exhausted then next_attempt_at else now() + make_interval(secs => least(3600, power(2, attempt_count)::integer * 30)) end,
      last_error = left(trim(failure_message), 2000),
      completed_at = case when exhausted then now() else null end
  where id = job_row.id returning * into job_row;
  update public.marketplace_listings
  set quantity_sync_state = case when exhausted then 'error' else 'pending' end,
      last_error = left(trim(failure_message), 2000)
  where id = job_row.marketplace_listing_id and business_id = job_row.business_id;
  if exhausted then
    insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
    values (job_row.business_id, job_row.owner_id, 'marketplace.quantity_sync_failed', job_row.marketplace_listing_id::text,
      jsonb_build_object('job_id', job_row.id, 'attempts', job_row.attempt_count, 'error', job_row.last_error));
  end if;
  return job_row;
end;
$$;

revoke all on function public.claim_marketplace_action_job(uuid) from public;
revoke all on function public.complete_marketplace_action_job(uuid) from public;
revoke all on function public.fail_marketplace_action_job(uuid, text) from public;
grant execute on function public.claim_marketplace_action_job(uuid) to authenticated;
grant execute on function public.complete_marketplace_action_job(uuid) to authenticated;
grant execute on function public.fail_marketplace_action_job(uuid, text) to authenticated;
