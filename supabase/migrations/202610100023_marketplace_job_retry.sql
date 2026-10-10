-- Owner-approved recovery for jobs that exhausted automatic retries.
create or replace function public.retry_failed_marketplace_action_job(target_job_id uuid)
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
  where id = target_job_id and owner_id = auth.uid() and status = 'failed' for update;
  if not found then raise exception 'Failed marketplace action job was not found.'; end if;
  select * into account_row from public.marketplace_accounts
  where id = job_row.marketplace_account_id and owner_id = auth.uid() for update;
  if not found or account_row.outbound_paused or account_row.sync_mode not in ('review_required', 'active') then
    raise exception 'Outbound marketplace actions are paused or not approved.';
  end if;
  update public.marketplace_action_jobs
  set status = 'pending', attempt_count = 0, next_attempt_at = now(), completed_at = null
  where id = job_row.id returning * into job_row;
  update public.marketplace_listings set quantity_sync_state = 'pending'
  where id = job_row.marketplace_listing_id and business_id = job_row.business_id;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (job_row.business_id, job_row.owner_id, 'marketplace.action_retry_approved', job_row.id::text,
    jsonb_build_object('action_type', job_row.action_type, 'prior_error', job_row.last_error));
  return job_row;
end;
$$;

revoke all on function public.retry_failed_marketplace_action_job(uuid) from public;
grant execute on function public.retry_failed_marketplace_action_job(uuid) to authenticated;
