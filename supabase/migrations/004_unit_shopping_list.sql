-- Standalone unit-level shopping list for ad-hoc restocking (separate from trip shopping lists)
create table if not exists unit_shopping_items (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  item_id     uuid references items(id),
  item_name   text not null,  -- denormalized in case item_id is null (manual entry)
  quantity    integer not null default 1,
  unit_of_measure text not null default 'each',
  notes       text,
  added_by    uuid references profiles(id),
  is_purchased boolean not null default false,
  purchased_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table unit_shopping_items enable row level security;

create policy "unit_shopping_read" on unit_shopping_items
  for select using (is_unit_member(unit_id));

create policy "unit_shopping_write" on unit_shopping_items
  for insert with check (is_unit_member(unit_id));

create policy "unit_shopping_update" on unit_shopping_items
  for update using (is_unit_member(unit_id));

create index on unit_shopping_items (unit_id, is_purchased, created_at desc);
