-- Shopping category type dimensions per unit
create table shopping_category_types (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references units(id) on delete cascade,
  name         text not null,
  display_order integer not null default 0,
  created_at   timestamptz not null default now(),
  unique(unit_id, name)
);

-- Tags: each row links to either a unit shopping item or a trip shopping item
create table shopping_item_tags (
  id                 uuid primary key default gen_random_uuid(),
  unit_item_id       uuid references unit_shopping_items(id) on delete cascade,
  trip_item_id       uuid references shopping_items(id) on delete cascade,
  category_type_id   uuid not null references shopping_category_types(id) on delete cascade,
  value              text not null,
  constraint one_item_source check (
    (unit_item_id is not null)::int + (trip_item_id is not null)::int = 1
  )
);

create unique index shopping_item_tags_unit_cat
  on shopping_item_tags (unit_item_id, category_type_id)
  where unit_item_id is not null;

create unique index shopping_item_tags_trip_cat
  on shopping_item_tags (trip_item_id, category_type_id)
  where trip_item_id is not null;

-- Price per unit on both shopping tables
alter table unit_shopping_items add column if not exists unit_price numeric(10,2);
alter table shopping_items       add column if not exists unit_price numeric(10,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- Category type RPCs
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function get_shopping_category_types(p_unit_id uuid)
returns table(id uuid, name text, display_order integer)
language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  return query
  select t.id, t.name, t.display_order
  from shopping_category_types t
  where t.unit_id = p_unit_id
  order by t.display_order, t.name;
end;
$$;

create or replace function upsert_shopping_category_type(
  p_unit_id uuid,
  p_name    text,
  p_id      uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  if p_id is not null then
    update shopping_category_types set name = p_name
    where id = p_id and unit_id = p_unit_id
    returning id into v_id;
  else
    insert into shopping_category_types(unit_id, name)
    values(p_unit_id, p_name)
    on conflict(unit_id, name) do update set name = excluded.name
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function delete_shopping_category_type(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid;
begin
  select unit_id into v_unit_id from shopping_category_types where id = p_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  delete from shopping_category_types where id = p_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tag RPCs
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_shopping_item_tag(
  p_category_type_id uuid,
  p_value            text,
  p_unit_item_id     uuid default null,
  p_trip_item_id     uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid;
begin
  select ct.unit_id into v_unit_id
  from shopping_category_types ct where ct.id = p_category_type_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  if p_unit_item_id is not null then
    insert into shopping_item_tags(unit_item_id, category_type_id, value)
    values(p_unit_item_id, p_category_type_id, p_value)
    on conflict(unit_item_id, category_type_id) where unit_item_id is not null
    do update set value = excluded.value;
  elsif p_trip_item_id is not null then
    insert into shopping_item_tags(trip_item_id, category_type_id, value)
    values(p_trip_item_id, p_category_type_id, p_value)
    on conflict(trip_item_id, category_type_id) where trip_item_id is not null
    do update set value = excluded.value;
  end if;
end;
$$;

create or replace function remove_shopping_item_tag(
  p_category_type_id uuid,
  p_unit_item_id     uuid default null,
  p_trip_item_id     uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid;
begin
  select ct.unit_id into v_unit_id
  from shopping_category_types ct where ct.id = p_category_type_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  if p_unit_item_id is not null then
    delete from shopping_item_tags
    where unit_item_id = p_unit_item_id and category_type_id = p_category_type_id;
  elsif p_trip_item_id is not null then
    delete from shopping_item_tags
    where trip_item_id = p_trip_item_id and category_type_id = p_category_type_id;
  end if;
end;
$$;

-- All distinct tag values for a unit (used for autocomplete)
create or replace function get_all_tag_values(p_unit_id uuid)
returns table(category_type_id uuid, value text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  return query
  select distinct t.category_type_id, t.value
  from shopping_item_tags t
  join shopping_category_types ct on ct.id = t.category_type_id
  where ct.unit_id = p_unit_id
  order by t.category_type_id, t.value;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Update shopping item RPCs (also ensure add RPCs accept + return price/id)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function add_to_shopping_list(
  p_unit_id        uuid,
  p_item_name      text,
  p_quantity       integer,
  p_unit_of_measure text,
  p_notes          text default null,
  p_unit_price     numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  insert into unit_shopping_items(unit_id, item_name, quantity, unit_of_measure, notes, unit_price)
  values(p_unit_id, p_item_name, p_quantity, p_unit_of_measure, p_notes, p_unit_price)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function update_shopping_item(
  p_id              uuid,
  p_item_name       text,
  p_quantity        integer,
  p_unit_of_measure text,
  p_notes           text,
  p_unit_price      numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid;
begin
  select unit_id into v_unit_id from unit_shopping_items where id = p_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  update unit_shopping_items
  set item_name = p_item_name, quantity = p_quantity, unit_of_measure = p_unit_of_measure,
      notes = p_notes, unit_price = p_unit_price
  where id = p_id;
end;
$$;

create or replace function add_trip_shopping_item(
  p_trip_id        uuid,
  p_item_name      text,
  p_quantity_needed integer,
  p_store          text default null,
  p_notes          text default null,
  p_unit_price     numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid; v_id uuid;
begin
  select unit_id into v_unit_id from trips where id = p_trip_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  insert into shopping_items(trip_id, item_name, quantity_needed, store, notes, unit_price)
  values(p_trip_id, p_item_name, p_quantity_needed, p_store, p_notes, p_unit_price)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function update_trip_shopping_item(
  p_id              uuid,
  p_item_name       text,
  p_quantity_needed integer,
  p_notes           text,
  p_unit_price      numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid;
begin
  select t.unit_id into v_unit_id
  from shopping_items si join trips t on t.id = si.trip_id where si.id = p_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  update shopping_items
  set item_name = p_item_name, quantity_needed = p_quantity_needed,
      notes = p_notes, unit_price = p_unit_price
  where id = p_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Updated fetch RPCs that include tags + unit_price
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function get_shopping_list(p_unit_id uuid)
returns table(
  id               uuid,
  item_id          uuid,
  item_name        text,
  quantity         integer,
  unit_of_measure  text,
  notes            text,
  is_purchased     boolean,
  created_at       timestamptz,
  unit_price       numeric,
  tags             json
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  return query
  select
    usi.id,
    usi.item_id,
    usi.item_name,
    usi.quantity,
    usi.unit_of_measure,
    usi.notes,
    usi.is_purchased,
    usi.created_at,
    usi.unit_price,
    coalesce(
      (select json_agg(
         json_build_object('type_id', t.category_type_id, 'type_name', ct.name, 'value', t.value)
         order by ct.display_order, ct.name
       )
       from shopping_item_tags t
       join shopping_category_types ct on ct.id = t.category_type_id
       where t.unit_item_id = usi.id),
      '[]'::json
    ) as tags
  from unit_shopping_items usi
  where usi.unit_id = p_unit_id
  order by usi.created_at;
end;
$$;

create or replace function get_trip_shopping_items(p_trip_id uuid)
returns table(
  id                  uuid,
  item_id             uuid,
  item_name           text,
  quantity_needed     integer,
  quantity_purchased  integer,
  store               text,
  is_purchased        boolean,
  notes               text,
  unit_price          numeric,
  tags                json
) language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid;
begin
  select unit_id into v_unit_id from trips where id = p_trip_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  return query
  select
    si.id,
    si.item_id,
    si.item_name,
    si.quantity_needed,
    si.quantity_purchased,
    si.store,
    si.is_purchased,
    si.notes,
    si.unit_price,
    coalesce(
      (select json_agg(
         json_build_object('type_id', t.category_type_id, 'type_name', ct.name, 'value', t.value)
         order by ct.display_order, ct.name
       )
       from shopping_item_tags t
       join shopping_category_types ct on ct.id = t.category_type_id
       where t.trip_item_id = si.id),
      '[]'::json
    ) as tags
  from shopping_items si
  where si.trip_id = p_trip_id
  order by si.created_at;
end;
$$;
