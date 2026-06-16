create or replace function record_quantity(
  p_slot_id  uuid,
  p_quantity integer,
  p_notes    text default null
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

  insert into item_quantities (slot_id, quantity, updated_by, notes)
  values (p_slot_id, p_quantity, auth.uid(), p_notes);
end;
$$;

-- duplicate_container: copies a container and all its item slots to the same unit
create or replace function duplicate_container(p_container_id uuid, p_new_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
  v_new_id  uuid;
begin
  select unit_id into v_unit_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  -- Copy the container
  insert into containers (unit_id, name, type, purpose, notes)
  select unit_id, p_new_name, type, purpose, notes
  from containers where id = p_container_id
  returning id into v_new_id;

  -- Copy all item slots (without quantity history)
  insert into item_slots (container_id, item_id, expected_quantity)
  select v_new_id, item_id, expected_quantity
  from item_slots where container_id = p_container_id;

  return v_new_id;
end;
$$;
