-- Fetch trips for a unit
create or replace function get_trips(p_unit_id uuid)
returns table (
  id uuid,
  name text,
  trip_date date,
  return_date date,
  headcount integer,
  notes text,
  shopping_item_count bigint,
  purchased_count bigint,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    t.id, t.name, t.trip_date, t.return_date, t.headcount, t.notes,
    count(s.id) as shopping_item_count,
    count(s.id) filter (where s.is_purchased) as purchased_count,
    t.created_at
  from trips t
  left join shopping_items s on s.trip_id = t.id
  where t.unit_id = p_unit_id
  group by t.id
  order by t.trip_date desc;
end;
$$;

-- Fetch shopping items for a trip
create or replace function get_trip_shopping_items(p_trip_id uuid)
returns table (
  id uuid,
  item_id uuid,
  item_name text,
  quantity_needed integer,
  quantity_purchased integer,
  store text,
  is_purchased boolean,
  notes text,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from trips where id = p_trip_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    s.id,
    s.item_id,
    coalesce(i.name, s.custom_name) as item_name,
    s.quantity_needed,
    s.quantity_purchased,
    s.store,
    s.is_purchased,
    s.notes,
    s.created_at
  from shopping_items s
  left join items i on i.id = s.item_id
  where s.trip_id = p_trip_id
  order by s.is_purchased asc, s.created_at asc;
end;
$$;

-- Create a trip
create or replace function create_trip(
  p_unit_id    uuid,
  p_name       text,
  p_trip_date  date,
  p_return_date date default null,
  p_headcount  integer default null,
  p_notes      text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  insert into trips (unit_id, name, trip_date, return_date, headcount, notes, created_by)
  values (p_unit_id, p_name, p_trip_date, p_return_date, p_headcount, p_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Add item to trip shopping list
create or replace function add_trip_shopping_item(
  p_trip_id        uuid,
  p_item_name      text,
  p_quantity_needed integer,
  p_item_id        uuid default null,
  p_store          text default null,
  p_notes          text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
  v_id uuid;
begin
  select unit_id into v_unit_id from trips where id = p_trip_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  insert into shopping_items (trip_id, item_id, custom_name, quantity_needed, store, notes, created_by)
  values (p_trip_id, p_item_id, case when p_item_id is null then p_item_name else null end, p_quantity_needed, p_store, p_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Toggle trip shopping item purchased
create or replace function toggle_trip_item_purchased(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select t.unit_id into v_unit_id
  from shopping_items s join trips t on t.id = s.trip_id
  where s.id = p_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  update shopping_items
  set is_purchased = not is_purchased
  where id = p_id;
end;
$$;

-- Remove trip shopping item
create or replace function remove_trip_shopping_item(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select t.unit_id into v_unit_id
  from shopping_items s join trips t on t.id = s.trip_id
  where s.id = p_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  delete from shopping_items where id = p_id;
end;
$$;

-- Delete a trip
create or replace function delete_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from trips where id = p_trip_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  delete from trips where id = p_trip_id;
end;
$$;
