create or replace function edit_item_slot(
  p_slot_id         uuid,
  p_item_name       text,
  p_category        text default null,
  p_unit_of_measure text default 'each',
  p_expected_qty    integer default 1,
  p_min_qty         integer default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
  v_item_id uuid;
begin
  select i.unit_id, i.id into v_unit_id, v_item_id
  from item_slots s
  join items i on i.id = s.item_id
  where s.id = p_slot_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  update items
  set name = p_item_name, category = p_category, unit_of_measure = p_unit_of_measure, min_quantity = p_min_qty
  where id = v_item_id;

  update item_slots
  set expected_quantity = p_expected_qty
  where id = p_slot_id;
end;
$$;

-- Removes the item from this container (archives the slot); does not delete the item globally
create or replace function remove_item_from_container(p_slot_id uuid)
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

  delete from item_slots where id = p_slot_id;
end;
$$;
