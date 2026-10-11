-- Preserve the actual packaging-supply cost used by fulfillment and expose it to reporting.
alter table public.shipment_packages
  add column supply_cost numeric(12,2) not null default 0 check (supply_cost >= 0);

update public.shipment_packages package
set supply_cost = preset.default_supply_cost
from public.package_presets preset
where package.package_preset_id = preset.id
  and package.business_id = preset.business_id
  and preset.default_supply_cost is not null;

create or replace function public.apply_package_preset_supply_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.package_preset_id is not null and new.supply_cost = 0 then
    select coalesce(default_supply_cost, 0) into new.supply_cost
    from public.package_presets
    where id = new.package_preset_id and business_id = new.business_id;
  end if;
  return new;
end;
$$;

create trigger shipment_packages_apply_preset_supply_cost
before insert on public.shipment_packages
for each row execute function public.apply_package_preset_supply_cost();

create or replace function public.confirm_shipment_package_with_cost(
  target_package_id uuid,
  confirmed_weight_grams integer,
  confirmed_length_mm integer,
  confirmed_width_mm integer,
  confirmed_height_mm integer,
  confirmed_supply_cost numeric
)
returns public.shipment_packages
language plpgsql
security invoker
set search_path = public
as $$
declare
  package_row public.shipment_packages%rowtype;
  shipment_row public.shipments%rowtype;
begin
  if confirmed_weight_grams <= 0 or confirmed_length_mm <= 0 or confirmed_width_mm <= 0 or confirmed_height_mm <= 0 then
    raise exception 'Final weight and all dimensions must be greater than zero.';
  end if;
  if confirmed_supply_cost is null or confirmed_supply_cost < 0 then
    raise exception 'Packaging supply cost must be zero or greater.';
  end if;
  select * into package_row from public.shipment_packages
  where id = target_package_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Shipment package was not found.'; end if;
  select * into shipment_row from public.shipments
  where id = package_row.shipment_id and business_id = package_row.business_id for update;
  if shipment_row.state not in ('ready_to_pack', 'ready_for_label') then
    raise exception 'Confirm the pick before final package measurements.';
  end if;
  update public.shipment_packages set
    final_weight_grams = confirmed_weight_grams,
    length_mm = confirmed_length_mm,
    width_mm = confirmed_width_mm,
    height_mm = confirmed_height_mm,
    supply_cost = confirmed_supply_cost,
    measurement_state = 'confirmed'
  where id = package_row.id returning * into package_row;
  if not exists (
    select 1 from public.shipment_packages
    where shipment_id = shipment_row.id and measurement_state <> 'confirmed'
  ) then update public.shipments set state = 'ready_for_label' where id = shipment_row.id; end if;
  insert into public.activity_events (business_id, owner_id, event_type, entity_id, details)
  values (package_row.business_id, package_row.owner_id, 'shipment.package_confirmed', package_row.id::text,
    jsonb_build_object('shipment_id', package_row.shipment_id, 'weight_grams', confirmed_weight_grams,
      'length_mm', confirmed_length_mm, 'width_mm', confirmed_width_mm, 'height_mm', confirmed_height_mm,
      'supply_cost', confirmed_supply_cost));
  return package_row;
end;
$$;

revoke all on function public.confirm_shipment_package_with_cost(uuid, integer, integer, integer, integer, numeric) from public;
grant execute on function public.confirm_shipment_package_with_cost(uuid, integer, integer, integer, integer, numeric) to authenticated;
