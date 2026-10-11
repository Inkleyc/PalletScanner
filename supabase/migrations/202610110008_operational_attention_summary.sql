-- One owner-scoped operational attention definition shared by web and mobile.
create or replace function public.get_operational_attention_summary()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with affected_orders as (
    select orders.id
    from public.orders
    where orders.owner_id = auth.uid()
      and (
        exists (select 1 from public.order_lines line where line.order_id = orders.id and (
          line.match_state <> 'matched'
          or (jsonb_array_length(coalesce(line.raw_payload->'refunds', '[]'::jsonb)) > 0 and line.refunded_quantity = 0)
        ))
        or exists (select 1 from public.assisted_channel_tasks task where task.order_id = orders.id and task.state = 'open')
        or exists (select 1 from public.shipments shipment where shipment.order_id = orders.id and (
          shipment.state = 'exception'
          or (shipment.state not in ('delivered', 'picked_up', 'cancelled', 'shipped') and shipment.ship_by_at <= now() + interval '24 hours')
        ))
      )
  ), due_returns as (
    select count(*)::integer as count from public.returns
    where owner_id = auth.uid() and state not in ('resolved', 'closed', 'cancelled')
      and action_due_at <= now() + interval '24 hours'
  ), marketplace_work as (
    select count(*)::integer as count from public.marketplace_action_jobs
    where owner_id = auth.uid() and status in ('pending', 'running', 'retry_wait', 'failed')
  ), sale_recovery as (
    select count(distinct shipment.id)::integer as count
    from public.shipments shipment
    where shipment.owner_id = auth.uid() and shipment.shipment_kind = 'original'
      and shipment.state in ('shipped', 'delivered')
      and exists (
        select 1 from public.order_lines line
        where line.order_id = shipment.order_id
          and not exists (select 1 from public.sales sale where sale.order_line_id = line.id)
      )
  )
  select jsonb_build_object(
    'orderIssues', (select count(*)::integer from affected_orders),
    'returnIssues', (select count from due_returns),
    'marketplaceIssues', (select count from marketplace_work),
    'recoveryIssues', (select count from sale_recovery),
    'calculatedAt', now()
  );
$$;

revoke all on function public.get_operational_attention_summary() from public;
grant execute on function public.get_operational_attention_summary() to authenticated;
