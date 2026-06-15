-- RPC: add a container to a unit
create or replace function add_container(
  p_unit_id     uuid,
  p_name        text,
  p_type        text,
  p_purpose     text,
  p_notes       text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if exists (select 1 from containers where unit_id = p_unit_id and lower(name) = lower(p_name) and is_archived = false) then
    raise exception 'A container named "%" already exists in this unit', p_name;
  end if;

  insert into containers (unit_id, name, type, purpose, notes)
  values (p_unit_id, p_name, p_type, p_purpose, p_notes)
  returning id into v_id;

  return v_id;
end;
$$;

-- RPC: add an item + slot to a container (creates item if needed)
create or replace function add_item_to_container(
  p_container_id    uuid,
  p_item_name       text,
  p_category        text default null,
  p_unit_of_measure text default 'each',
  p_expected_qty    integer default 1,
  p_min_qty         integer default null,
  p_existing_item_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
  v_item_id uuid;
  v_slot_id uuid;
begin
  -- Look up the unit from the container
  select unit_id into v_unit_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  -- Reuse existing item or create a new one
  if p_existing_item_id is not null then
    v_item_id := p_existing_item_id;
  else
    insert into items (unit_id, name, category, unit_of_measure)
    values (v_unit_id, p_item_name, p_category, p_unit_of_measure)
    returning id into v_item_id;
  end if;

  insert into item_slots (container_id, item_id, expected_quantity)
  values (p_container_id, v_item_id, p_expected_qty)
  returning id into v_slot_id;

  if p_min_qty is not null then
    update items set min_quantity = p_min_qty where id = v_item_id;
  end if;

  return v_slot_id;
end;
$$;

-- RPC: record a quantity update for a slot
create or replace function record_quantity(
  p_slot_id  uuid,
  p_quantity integer
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select i.unit_id into v_unit_id
  from item_slots s
  join items i on i.id = s.item_id
  where s.id = p_slot_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  insert into item_quantities (slot_id, quantity, updated_by)
  values (p_slot_id, p_quantity, auth.uid());
end;
$$;

-- RPC: add item to unit shopping list
create or replace function add_to_shopping_list(
  p_unit_id       uuid,
  p_item_id       uuid default null,
  p_item_name     text default null,
  p_quantity      integer default 1,
  p_unit_of_measure text default 'each',
  p_notes         text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  insert into unit_shopping_items (unit_id, item_id, item_name, quantity, unit_of_measure, notes, added_by)
  values (p_unit_id, p_item_id, coalesce(p_item_name, 'Unknown'), p_quantity, p_unit_of_measure, p_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
