-- Item categories make sell-through and profitability comparisons meaningful.
alter table public.inventory_items
add column if not exists category text not null default 'Uncategorized'
check (length(trim(category)) > 0);

create index if not exists inventory_items_owner_category_idx
on public.inventory_items(owner_id, category);
